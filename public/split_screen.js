// ================================================================
// Client: Split-screen Flappy Bird. Server is authoritative.
// We render both players' views from the server state.
// ================================================================

const socket = io();

let world = null;     // dimensions & physics constants sent by server
let mySide = null;    // 'left' or 'right'
let latestState = null;
let opponentLeft = false;

// --- DOM refs ---
const nameScreen   = document.getElementById('nameScreen');
const lobbyScreen  = document.getElementById('lobbyScreen');
const gameScreen   = document.getElementById('gameScreen');
const resultScreen = document.getElementById('resultScreen');

const playerNameInput = document.getElementById('playerName');
const findMatchBtn    = document.getElementById('findMatchBtn');
const readyBtn        = document.getElementById('readyBtn');

// Pre-fill the display name from sessionStorage if the player is logged in
// (or was a guest who picked a name in a previous match).
(function prefillName() {
  const stored = sessionStorage.getItem('username');
  const mode   = sessionStorage.getItem('mode');
  if (!stored) return;
  // "GUEST" is the default name for guest mode; don't pre-fill that literal
  // since it's not meaningful as a display name.
  if (mode === 'GUEST' && /^GUEST$/i.test(stored)) return;
  playerNameInput.value = stored.toUpperCase();
})();

// Back-navigation helpers — always return to the multiplayer mode picker.
function goToMultiplayerMenu() {
  window.location.href = '/multiplayer';
}
const ssNameBack    = document.getElementById('ssNameBack');
const ssLobbyQuit   = document.getElementById('ssLobbyQuit');
const ssResultBack  = document.getElementById('ssResultBack');
if (ssNameBack)   ssNameBack.addEventListener('click',   goToMultiplayerMenu);
if (ssLobbyQuit)  ssLobbyQuit.addEventListener('click',  goToMultiplayerMenu);
if (ssResultBack) ssResultBack.addEventListener('click', goToMultiplayerMenu);
const countdownEl     = document.getElementById('countdown');
const playAgainBtn    = document.getElementById('playAgainBtn');
const opponentLeftMsg = document.getElementById('opponentLeftMsg');

const slotLeft  = document.getElementById('slotLeft');
const slotRight = document.getElementById('slotRight');

const leftCanvas  = document.getElementById('leftCanvas');
const rightCanvas = document.getElementById('rightCanvas');
const leftCtx  = leftCanvas.getContext('2d');
const rightCtx = rightCanvas.getContext('2d');

const leftNameEl  = document.getElementById('leftName');
const rightNameEl = document.getElementById('rightName');
const leftScoreEl = document.getElementById('leftScore');
const rightScoreEl = document.getElementById('rightScore');

// --- Assets ---
const images = {};
function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}
images.bg        = loadImage('assets/bg.png');
images.bird      = loadImage('assets/bird.png');
images.upperPipe = loadImage('assets/upperPipe.png');
images.lowerPipe = loadImage('assets/lowerPipe.png');

// --- Screen helpers ---
function showScreen(el) {
  [nameScreen, lobbyScreen, gameScreen, resultScreen].forEach(s => s.classList.add('hidden'));
  el.classList.remove('hidden');
}

// ----------------------------------------------------------------
// 1. Name screen — find match
// ----------------------------------------------------------------
findMatchBtn.addEventListener('click', () => {
  const name = (playerNameInput.value.trim() || 'GUEST').toUpperCase();
  findMatchBtn.disabled = true;
  findMatchBtn.textContent = 'SEARCHING...';
  socket.emit('findMatch', { name });
});

playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') findMatchBtn.click();
});

// ----------------------------------------------------------------
// 2. Socket events
// ----------------------------------------------------------------
socket.on('connect', () => {
  console.log('[socket] connected:', socket.id);
});

socket.on('matched', (payload) => {
  mySide = payload.side;
  world  = payload.world;
  opponentLeft = false;
  opponentLeftMsg.classList.add('hidden');
  showScreen(lobbyScreen);
});

socket.on('lobby', ({ players }) => {
  // reset slots
  for (const slot of [slotLeft, slotRight]) {
    slot.querySelector('.slot-name').textContent = 'WAITING...';
    const r = slot.querySelector('.slot-ready');
    r.textContent = 'NOT READY';
    r.classList.remove('ready');
  }
  for (const p of players) {
    const slot = p.side === 'left' ? slotLeft : slotRight;
    const isMe = p.sid === socket.id;
    slot.querySelector('.slot-name').textContent = (p.name || '').toUpperCase() + (isMe ? ' (YOU)' : '');
    const r = slot.querySelector('.slot-ready');
    r.textContent = p.ready ? 'READY' : 'NOT READY';
    r.classList.toggle('ready', !!p.ready);
  }
});

readyBtn.addEventListener('click', () => {
  socket.emit('ready');
});

socket.on('countdown', (n) => {
  // Show the countdown over the lobby screen BEFORE gameStart arrives.
  countdownEl.classList.remove('hidden');
  if (n > 0) {
    countdownEl.textContent = n;
  } else {
    countdownEl.textContent = 'GO!';
    setTimeout(() => countdownEl.classList.add('hidden'), 500);
  }
});

socket.on('gameStart', ({ world: w }) => {
  world = w;
  console.log('[client] gameStart received; world=', w);
  // Show the game screen FIRST so the flex layout gives the canvases a real size,
  // then measure on the next frame, then start the render loop.
  showScreen(gameScreen);
  requestAnimationFrame(() => {
    resizeCanvases();
    requestAnimationFrame(renderLoop);
  });
});

socket.on('state', (state) => {
  latestState = state;
});

socket.on('gameOver', ({ winner, scores }) => {
  latestState = latestState || { players: {} };
  showResult(winner, scores);
  // Persist this player's score to the MULTIPLAYER leaderboard.
  if (mySide && scores && typeof scores[mySide] === 'number') {
    submitMultiplayerScore(scores[mySide]);
  }
});

function submitMultiplayerScore(myScore) {
  const username = sessionStorage.getItem('username') || 'GUEST';
  sessionStorage.setItem('finalScore', myScore);
  sessionStorage.setItem('gameMode', 'MULTIPLAYER');
  fetch('/submit-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, score: myScore, mode: 'MULTIPLAYER' }),
  }).then(r => r.json())
    .then(data => console.log('[mp] score submitted:', data))
    .catch(err => console.warn('[mp] score submit failed:', err));
}

socket.on('opponentLeft', () => {
  opponentLeft = true;
  opponentLeftMsg.classList.remove('hidden');
  showResult('tie', { left: 0, right: 0 });
});

playAgainBtn.addEventListener('click', () => {
  if (opponentLeft) {
    // opponent gone — find a new match
    location.reload();
    return;
  }
  socket.emit('playAgain');
  showScreen(lobbyScreen);
});

// ----------------------------------------------------------------
// 3. Input — flap
// ----------------------------------------------------------------
function sendFlap() {
  socket.emit('flap');
}
function sendDoubleFlap() {
  socket.emit('doubleFlap');
}

window.addEventListener('keydown', (e) => {
  if (gameScreen.classList.contains('hidden')) return;
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    sendFlap();
  } else if (e.code === 'KeyE') {
    e.preventDefault();
    sendDoubleFlap();
  }
});
window.addEventListener('touchstart', (e) => {
  if (gameScreen.classList.contains('hidden')) return;
  e.preventDefault();
  sendFlap();
}, { passive: false });
// Clicking on your own pane also flaps — feels nice for laptops/trackpads
leftCanvas.addEventListener('mousedown', () => { if (mySide === 'left')  sendFlap(); });
rightCanvas.addEventListener('mousedown', () => { if (mySide === 'right') sendFlap(); });

// ----------------------------------------------------------------
// 4. Rendering
// ----------------------------------------------------------------
function resizeCanvases() {
  for (const c of [leftCanvas, rightCanvas]) {
    const rect = c.getBoundingClientRect();
    // Fall back to half the viewport if the flex layout hasn't settled yet.
    const w = Math.floor(rect.width)  || Math.floor(window.innerWidth / 2);
    const h = Math.floor(rect.height) || Math.floor(window.innerHeight - 80);
    c.width  = Math.max(320, w);
    c.height = Math.max(320, h);
  }
  console.log('[client] resized canvases:',
    `${leftCanvas.width}x${leftCanvas.height}`,
    `${rightCanvas.width}x${rightCanvas.height}`);
}
window.addEventListener('resize', resizeCanvases);

function drawPaneFor(ctx, side) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (!world) return;

  // scale logical world -> canvas
  const sx = w / world.width;
  const sy = h / world.height;

  // background
  if (images.bg.complete && images.bg.naturalWidth) {
    ctx.drawImage(images.bg, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#70c5ce';
    ctx.fillRect(0, 0, w, h);
  }

  if (!latestState) return;

  // pipes (same for both players)
  for (const pipe of latestState.pipes) {
    const px = pipe.x * sx;
    const pw = world.pipeWidth * sx;
    const gapTop    = pipe.gapY * sy;
    const gapBottom = (pipe.gapY + world.gapHeight) * sy;

    // upper pipe
    if (images.upperPipe.complete && images.upperPipe.naturalWidth) {
      ctx.drawImage(images.upperPipe, px, 0, pw, gapTop);
    } else {
      ctx.fillStyle = '#2e8b57';
      ctx.fillRect(px, 0, pw, gapTop);
    }
    // lower pipe
    if (images.lowerPipe.complete && images.lowerPipe.naturalWidth) {
      ctx.drawImage(images.lowerPipe, px, gapBottom, pw, h - gapBottom);
    } else {
      ctx.fillStyle = '#2e8b57';
      ctx.fillRect(px, gapBottom, pw, h - gapBottom);
    }
  }

  // bird for this pane (the one matching `side`)
  const p = latestState.players[side];
  if (!p) return;
  const bx = world.birdX * sx;
  const by = p.y * sy;
  const bw = world.birdSize * sx;
  const bh = world.birdSize * sy;

  // color tint by side using a filter (works for white-ish bird sprites well enough)
  ctx.save();
  if (!p.alive) ctx.globalAlpha = 0.35;
  if (images.bird.complete && images.bird.naturalWidth) {
    ctx.drawImage(images.bird, bx, by, bw, bh);
  } else {
    ctx.fillStyle = side === 'left' ? '#ef476f' : '#118ab2';
    ctx.fillRect(bx, by, bw, bh);
  }
  ctx.restore();

  // side label overlay (arcade font)
  ctx.fillStyle = side === 'left' ? '#e53935' : '#1e79a8';
  ctx.font = "12px 'Press Start 2P', monospace";
  ctx.textBaseline = 'top';
  ctx.fillText(side === mySide ? 'YOU' : 'OPPONENT', 12, 14);

  if (!p.alive) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.font = "36px 'Press Start 2P', monospace";
    // red shadow, yellow fill — same treatment as the title
    ctx.fillStyle = '#e53935';
    ctx.fillText('DEAD', w / 2 + 4, h / 2 - 16);
    ctx.fillStyle = '#ffeb3b';
    ctx.fillText('DEAD', w / 2, h / 2 - 20);

    ctx.font = "12px 'Press Start 2P', monospace";
    ctx.fillStyle = '#bbdefb';
    ctx.fillText(`SCORE  ${p.score}`, w / 2, h / 2 + 26);
    ctx.textAlign = 'start';
  }
}

function updateHud() {
  if (!latestState) return;
  const l = latestState.players.left;
  const r = latestState.players.right;
  if (l) {
    leftNameEl.textContent  = (l.name || '').toUpperCase() + (mySide === 'left'  ? ' (YOU)' : '');
    leftScoreEl.textContent = l.score;
  }
  if (r) {
    rightNameEl.textContent = (r.name || '').toUpperCase() + (mySide === 'right' ? ' (YOU)' : '');
    rightScoreEl.textContent = r.score;
  }
}

function renderLoop() {
  if (!gameScreen.classList.contains('hidden')) {
    drawPaneFor(leftCtx, 'left');
    drawPaneFor(rightCtx, 'right');
    updateHud();
    requestAnimationFrame(renderLoop);
  }
}

// ----------------------------------------------------------------
// 5. Result screen
// ----------------------------------------------------------------
function showResult(winner, scores) {
  const title = document.getElementById('resultTitle');
  title.classList.remove('winner-left', 'winner-right', 'tie');

  if (opponentLeft) {
    title.textContent = 'OPPONENT LEFT';
    title.classList.add('tie');
  } else if (winner === 'tie') {
    title.textContent = "IT'S A TIE";
    title.classList.add('tie');
  } else {
    // Is the winner me?
    const iWon = winner === mySide;
    title.textContent = iWon ? 'YOU WIN!' : 'YOU LOSE';
    title.classList.add(winner === 'left' ? 'winner-left' : 'winner-right');
  }

  const lp = latestState && latestState.players.left;
  const rp = latestState && latestState.players.right;
  document.getElementById('resLeftName').textContent  = lp ? (lp.name || '').toUpperCase() : '—';
  document.getElementById('resRightName').textContent = rp ? (rp.name || '').toUpperCase() : '—';
  document.getElementById('resLeftScore').textContent  = scores.left ?? (lp ? lp.score : 0);
  document.getElementById('resRightScore').textContent = scores.right ?? (rp ? rp.score : 0);

  showScreen(resultScreen);
}
