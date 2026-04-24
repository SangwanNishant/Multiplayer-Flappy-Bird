// ================================================================
// Split-screen Flappy Bird — Supabase Realtime edition (Vercel-safe).
// ----------------------------------------------------------------
// Architecture (100% browser-to-browser through Supabase Realtime;
// no server loop, no database writes during matchmaking):
//
//   1. Matchmaking lobby: all searching players join a shared Realtime
//      channel `lobby:mp`. Each tracks their own presence with
//      { id, name, joinedAt }.
//
//   2. Pairing protocol (works even if players spam F5):
//        - Every presence update → sort all players by (joinedAt, id).
//          This gives every client the same stable ordering.
//        - If I am the oldest → I'm the host (side 'left'); wait.
//        - If I'm not the oldest → send `pair_request` to the oldest
//          with a freshly-generated matchId.
//        - Oldest accepts the FIRST `pair_request` received and replies
//          `pair_accept`. Both clients then untrack the lobby and join
//          `match:<matchId>`. Concurrent pair_requests get ignored
//          (the 2nd requester times out and retries the new oldest).
//
//   3. Match session: identical to before. Host runs physics at 60 Hz,
//      broadcasts state at ~30 Hz. Peer sends flap events back.
// ================================================================

const WORLD = {
    width: 800,
    height: 600,
    birdX: 100,
    birdSize: 30,
    gravity: 0.42,
    lift: -6.2,
    terminalVelocity: 14,
    pipeWidth: 75,
    pipeSpeed: 4.8,
    gapHeight: 160,
    pipeSpacing: 300,
    scorePerPipe: 50,
    tickMs: 1000 / 60,
};

// ---- State ----
let sb = null;
let myId = makeId();
let myName = '';
let myJoinedAt = 0;

let lobbyChannel = null;
let lobbyPollTimer = null;
let pairCommitted = false;
let pendingPairTarget = null;    // id we last sent a pair_request to
let pendingPairSentAt = 0;

let matchChannel = null;
let matchId = null;
let mySide = null;               // 'left' | 'right'
let peerId = null;
let peerName = '';

let iAmReady = false;
let peerIsReady = false;
let world = null;
let latestState = null;
let opponentLeft = false;
let hostGame = null;

// ---- DOM refs ----
const nameScreen   = document.getElementById('nameScreen');
const lobbyScreen  = document.getElementById('lobbyScreen');
const gameScreen   = document.getElementById('gameScreen');
const resultScreen = document.getElementById('resultScreen');

const playerNameInput = document.getElementById('playerName');
const findMatchBtn    = document.getElementById('findMatchBtn');
const readyBtn        = document.getElementById('readyBtn');

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

// ---- Assets ----
const images = {};
function loadImage(src) { const img = new Image(); img.src = src; return img; }
images.bg        = loadImage('assets/bg.png');
images.bird      = loadImage('assets/bird.png');
images.upperPipe = loadImage('assets/upperPipe.png');
images.lowerPipe = loadImage('assets/lowerPipe.png');

// ---- Helpers ----
function makeId() {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    // Fallback for older browsers
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function showScreen(el) {
    [nameScreen, lobbyScreen, gameScreen, resultScreen].forEach(s => s.classList.add('hidden'));
    el.classList.remove('hidden');
}

// ---- Pre-fill display name from sessionStorage ----
(function prefillName() {
    const stored = sessionStorage.getItem('username');
    const mode   = sessionStorage.getItem('mode');
    if (!stored) return;
    if (mode === 'GUEST' && /^GUEST$/i.test(stored)) return;
    playerNameInput.value = stored.toUpperCase();
})();

// ---- Back-navigation helpers ----
function goToMultiplayerMenu() { window.location.href = '/multiplayer'; }
const ssNameBack   = document.getElementById('ssNameBack');
const ssLobbyQuit  = document.getElementById('ssLobbyQuit');
const ssResultBack = document.getElementById('ssResultBack');
if (ssNameBack)   ssNameBack.addEventListener('click',   () => { cancelMatchmaking(); goToMultiplayerMenu(); });
if (ssLobbyQuit)  ssLobbyQuit.addEventListener('click',  () => { cleanup();            goToMultiplayerMenu(); });
if (ssResultBack) ssResultBack.addEventListener('click', () => { cleanup();            goToMultiplayerMenu(); });

// ================================================================
// Boot: load Supabase config (URL + anon key) from the server.
// ================================================================
const sbReady = (async () => {
    try {
        const resp = await fetch('/config');
        if (!resp.ok) throw new Error('could not load /config');
        const cfg = await resp.json();
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
            throw new Error('server returned empty Supabase config; check env vars');
        }
        sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
            realtime: { params: { eventsPerSecond: 60 } },
        });
        console.log('[rt] supabase client ready');
    } catch (err) {
        console.error('[rt] supabase init failed:', err);
        alert('Failed to connect to game servers. Please reload.');
    }
})();

// ================================================================
// 1. Find match — Realtime Presence matchmaking
// ================================================================
findMatchBtn.addEventListener('click', async () => {
    const name = (playerNameInput.value.trim() || 'GUEST').toUpperCase();
    if (!name) return;
    myName = name;

    findMatchBtn.disabled = true;
    findMatchBtn.textContent = 'SEARCHING...';

    try {
        await sbReady;
        if (!sb) throw new Error('no supabase client');
        await joinLobby();
    } catch (err) {
        console.error('[mm] failed to start matchmaking:', err);
        findMatchBtn.disabled = false;
        findMatchBtn.textContent = 'FIND MATCH';
        alert('Could not connect. Please try again.');
    }
});

playerNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') findMatchBtn.click();
});

async function joinLobby() {
    // Reset per-search state in case of retry
    myId = makeId();
    myJoinedAt = Date.now();
    pairCommitted = false;
    pendingPairTarget = null;
    pendingPairSentAt = 0;

    lobbyChannel = sb.channel('lobby:mp', {
        config: {
            presence: { key: myId },
            broadcast: { self: false, ack: false },
        },
    });

    // --- Handle incoming pair_request (I might be the oldest) ---
    lobbyChannel.on('broadcast', { event: 'pair_request' }, ({ payload }) => {
        if (!payload || payload.to !== myId || pairCommitted) return;
        console.log('[mm] received pair_request from', payload.fromName || payload.from);
        pairCommitted = true;
        const { from: otherId, fromName, matchId: proposedId } = payload;
        // Ack the requester
        lobbyChannel.send({
            type: 'broadcast',
            event: 'pair_accept',
            payload: {
                to: otherId,
                from: myId,
                fromName: myName,
                matchId: proposedId,
            },
        });
        finalizeMatch({
            matchId: proposedId,
            side: 'left',             // oldest = host
            peerId: otherId,
            peerName: (fromName || '').toString().toUpperCase() || 'OPPONENT',
        });
    });

    // --- Handle my pair_request being accepted ---
    lobbyChannel.on('broadcast', { event: 'pair_accept' }, ({ payload }) => {
        if (!payload || payload.to !== myId || pairCommitted) return;
        console.log('[mm] pair_accept from', payload.fromName || payload.from);
        pairCommitted = true;
        finalizeMatch({
            matchId: payload.matchId,
            side: 'right',            // joiner = peer
            peerId: payload.from,
            peerName: (payload.fromName || '').toString().toUpperCase() || 'OPPONENT',
        });
    });

    // --- Presence events re-trigger the pairing attempt ---
    lobbyChannel.on('presence', { event: 'sync' },  attemptPair);
    lobbyChannel.on('presence', { event: 'join' },  attemptPair);
    lobbyChannel.on('presence', { event: 'leave' }, attemptPair);

    await lobbyChannel.subscribe(async (status) => {
        console.log('[mm] lobby status:', status);
        if (status === 'SUBSCRIBED') {
            await lobbyChannel.track({
                id: myId,
                name: myName,
                joinedAt: myJoinedAt,
            });
            // Also kick off polling in case presence events are sparse
            // (e.g. I'm the only one for a while, then someone joins — we
            // want to retry pairing if a pair_accept is lost on the wire).
            if (lobbyPollTimer) clearInterval(lobbyPollTimer);
            lobbyPollTimer = setInterval(attemptPair, 1000);
        }
    });
}

function attemptPair() {
    if (pairCommitted || !lobbyChannel) return;

    const state = lobbyChannel.presenceState();
    const all = [];
    for (const key of Object.keys(state)) {
        for (const meta of state[key]) {
            if (meta && meta.id && typeof meta.joinedAt === 'number') {
                all.push(meta);
            }
        }
    }
    if (all.length < 2) return; // nobody to pair with yet

    // Stable deterministic ordering: oldest first; tie-break by id
    all.sort((a, b) => {
        if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
        return String(a.id).localeCompare(String(b.id));
    });

    const myIdx = all.findIndex(p => p.id === myId);
    if (myIdx < 0) return; // not present yet

    // If I am the oldest (index 0), I wait for someone to pair_request me.
    if (myIdx === 0) {
        pendingPairTarget = null;
        return;
    }

    // Otherwise, try to pair with the oldest.
    const target = all[0];

    // Rate-limit: if we already sent a request to this target recently,
    // only resend after 2 seconds (covers dropped messages).
    const now = Date.now();
    if (pendingPairTarget === target.id && (now - pendingPairSentAt) < 2000) {
        return;
    }

    const proposedMatchId = makeId();
    pendingPairTarget = target.id;
    pendingPairSentAt = now;

    console.log('[mm] sending pair_request to', target.name || target.id, '(match', proposedMatchId + ')');
    lobbyChannel.send({
        type: 'broadcast',
        event: 'pair_request',
        payload: {
            to: target.id,
            from: myId,
            fromName: myName,
            matchId: proposedMatchId,
        },
    });
}

function cancelMatchmaking() {
    if (lobbyPollTimer) { clearInterval(lobbyPollTimer); lobbyPollTimer = null; }
    if (lobbyChannel) {
        try { lobbyChannel.untrack().catch(() => {}); } catch (_) {}
        try { lobbyChannel.unsubscribe().catch(() => {}); } catch (_) {}
        lobbyChannel = null;
    }
    pairCommitted = false;
    pendingPairTarget = null;
}

// ================================================================
// Finalize match — leave the lobby, join the match channel
// ================================================================
async function finalizeMatch({ matchId: mid, side, peerId: pid, peerName: pname }) {
    matchId  = mid;
    mySide   = side;
    peerId   = pid;
    peerName = pname;

    // Leave the lobby — we've paired.
    if (lobbyPollTimer) { clearInterval(lobbyPollTimer); lobbyPollTimer = null; }
    if (lobbyChannel) {
        try { await lobbyChannel.untrack(); } catch (_) {}
        try { await lobbyChannel.unsubscribe(); } catch (_) {}
        lobbyChannel = null;
    }

    console.log('[mm] matched! matchId=', matchId, 'side=', mySide, 'peer=', peerName);
    await joinMatchChannel();

    showScreen(lobbyScreen);
    updateLobby();
}

// ================================================================
// 2. Match channel wiring
// ================================================================
async function joinMatchChannel() {
    matchChannel = sb.channel(`match:${matchId}`, {
        config: {
            broadcast: { self: false, ack: false },
            presence:  { key: mySide },
        },
    });

    // Presence — detect peer drop mid-match
    matchChannel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const p of leftPresences) {
            if (p.side && p.side !== mySide) handleOpponentLeft();
        }
    });

    // Broadcast events
    matchChannel.on('broadcast', { event: 'hello' },     handleHello);
    matchChannel.on('broadcast', { event: 'ready' },     handleReady);
    matchChannel.on('broadcast', { event: 'countdown' }, handleCountdown);
    matchChannel.on('broadcast', { event: 'gameStart' }, handleGameStart);
    matchChannel.on('broadcast', { event: 'state' },     handleState);
    matchChannel.on('broadcast', { event: 'flap' },      handleFlap);
    matchChannel.on('broadcast', { event: 'gameOver' },  handleGameOver);

    await matchChannel.subscribe(async (status) => {
        console.log('[rt] match channel status:', status);
        if (status === 'SUBSCRIBED') {
            await matchChannel.track({ side: mySide, name: myName });
            // Tell the peer our name (covers the case where they haven't
            // heard it via the pair_request/accept exchange for any reason).
            matchChannel.send({
                type: 'broadcast',
                event: 'hello',
                payload: { side: mySide, name: myName },
            });
        }
    });
}

function handleHello({ payload }) {
    if (!payload || payload.side === mySide) return;
    const n = (payload.name || '').toString().toUpperCase();
    if (n) peerName = n;
    updateLobby();
    matchChannel.send({
        type: 'broadcast',
        event: 'hello',
        payload: { side: mySide, name: myName, echo: true },
    });
}

// ================================================================
// 3. Lobby / ready-up
// ================================================================
function updateLobby() {
    const left = {
        name: mySide === 'left'  ? myName : (peerName || 'WAITING...'),
        ready: mySide === 'left'  ? iAmReady : peerIsReady,
        isMe: mySide === 'left',
    };
    const right = {
        name: mySide === 'right' ? myName : (peerName || 'WAITING...'),
        ready: mySide === 'right' ? iAmReady : peerIsReady,
        isMe: mySide === 'right',
    };
    updateSlot(slotLeft,  left);
    updateSlot(slotRight, right);
}
function updateSlot(slot, { name, ready, isMe }) {
    slot.querySelector('.slot-name').textContent = name + (isMe ? ' (YOU)' : '');
    const r = slot.querySelector('.slot-ready');
    r.textContent = ready ? 'READY' : 'NOT READY';
    r.classList.toggle('ready', !!ready);
}

readyBtn.addEventListener('click', () => {
    if (!matchChannel) return;
    iAmReady = !iAmReady;
    updateLobby();
    matchChannel.send({
        type: 'broadcast',
        event: 'ready',
        payload: { side: mySide, ready: iAmReady },
    });
    maybeStartGame();
});

function handleReady({ payload }) {
    if (!payload || payload.side === mySide) return;
    peerIsReady = !!payload.ready;
    updateLobby();
    maybeStartGame();
}

// Only the host (left) starts the countdown when both players are ready.
function maybeStartGame() {
    if (mySide !== 'left') return;
    if (!(iAmReady && peerIsReady)) return;
    if (hostGame && hostGame.started) return;
    startCountdownThenGame();
}

function startCountdownThenGame() {
    let n = 3;
    emitCountdown(n);
    const iv = setInterval(() => {
        n--;
        emitCountdown(n);
        if (n <= 0) {
            clearInterval(iv);
            startHostGame();
        }
    }, 1000);
}

function emitCountdown(n) {
    handleCountdown({ payload: { n } });
    matchChannel.send({ type: 'broadcast', event: 'countdown', payload: { n } });
}

function handleCountdown({ payload }) {
    const n = payload && typeof payload.n === 'number' ? payload.n : 0;
    countdownEl.classList.remove('hidden');
    if (n > 0) {
        countdownEl.textContent = String(n);
    } else {
        countdownEl.textContent = 'GO!';
        setTimeout(() => countdownEl.classList.add('hidden'), 500);
    }
}

// ================================================================
// 4. HOST physics
// ================================================================
function startHostGame() {
    world = { ...WORLD };
    hostGame = {
        started: true,
        gameOver: false,
        tickCount: 0,
        pipes: [],
        nextPipeId: 1,
        players: {
            left:  { name: myName,                 y: WORLD.height / 2, vy: 0, alive: true, score: 0 },
            right: { name: peerName || 'OPPONENT', y: WORLD.height / 2, vy: 0, alive: true, score: 0 },
        },
    };
    latestState = buildState(hostGame);

    matchChannel.send({
        type: 'broadcast',
        event: 'gameStart',
        payload: { world },
    });

    enterGameScreen();
    hostGame.timer = setInterval(hostStep, WORLD.tickMs);
}

function hostStep() {
    const g = hostGame;
    if (!g || g.gameOver) return;
    g.tickCount++;

    for (const side of ['left', 'right']) {
        const p = g.players[side];
        if (!p.alive) continue;
        p.vy += WORLD.gravity;
        if (p.vy > WORLD.terminalVelocity) p.vy = WORLD.terminalVelocity;
        p.y += p.vy;
        if (p.y < 0 || p.y + WORLD.birdSize > WORLD.height) p.alive = false;
    }

    for (const pipe of g.pipes) pipe.x -= WORLD.pipeSpeed;
    g.pipes = g.pipes.filter(p => p.x + WORLD.pipeWidth > 0);

    const last = g.pipes[g.pipes.length - 1];
    if (!last || last.x < WORLD.width - WORLD.pipeSpacing) {
        const minTop = 100;
        const maxTop = WORLD.height - WORLD.gapHeight - 100;
        const gapY = minTop + Math.random() * Math.max(1, maxTop - minTop);
        g.pipes.push({
            id: g.nextPipeId++, x: WORLD.width, gapY,
            passedLeft: false, passedRight: false,
        });
    }

    for (const side of ['left', 'right']) {
        const p = g.players[side];
        if (!p.alive) continue;
        const flag = side === 'left' ? 'passedLeft' : 'passedRight';
        for (const pipe of g.pipes) {
            if (!pipe[flag] && pipe.x + WORLD.pipeWidth < WORLD.birdX) {
                pipe[flag] = true;
                p.score += WORLD.scorePerPipe;
            }
            const overlapX = WORLD.birdX + WORLD.birdSize > pipe.x &&
                             WORLD.birdX < pipe.x + WORLD.pipeWidth;
            if (overlapX) {
                const gapTop = pipe.gapY;
                const gapBottom = pipe.gapY + WORLD.gapHeight;
                if (p.y < gapTop || p.y + WORLD.birdSize > gapBottom) p.alive = false;
            }
        }
    }

    latestState = buildState(g);

    if (!g.players.left.alive && !g.players.right.alive) {
        g.gameOver = true;
        clearInterval(g.timer);
        const L = g.players.left, R = g.players.right;
        const winner = L.score > R.score ? 'left' : R.score > L.score ? 'right' : 'tie';
        const scores = { left: L.score, right: R.score };
        matchChannel.send({ type: 'broadcast', event: 'state',    payload: latestState });
        matchChannel.send({ type: 'broadcast', event: 'gameOver', payload: { winner, scores } });
        handleGameOver({ payload: { winner, scores } });
        return;
    }

    if (g.tickCount % 2 === 0) {
        matchChannel.send({ type: 'broadcast', event: 'state', payload: latestState });
    }
}

function buildState(g) {
    return {
        tick: g.tickCount,
        players: {
            left:  { y: g.players.left.y,  alive: g.players.left.alive,  score: g.players.left.score,  name: g.players.left.name },
            right: { y: g.players.right.y, alive: g.players.right.alive, score: g.players.right.score, name: g.players.right.name },
        },
        pipes: g.pipes.map(p => ({ id: p.id, x: p.x, gapY: p.gapY })),
    };
}

// ================================================================
// 5. PEER — renders host's broadcasts
// ================================================================
function handleGameStart({ payload }) {
    if (mySide === 'left') return;
    world = payload && payload.world ? payload.world : { ...WORLD };
    enterGameScreen();
}

function enterGameScreen() {
    showScreen(gameScreen);
    requestAnimationFrame(() => {
        resizeCanvases();
        requestAnimationFrame(renderLoop);
    });
}

function handleState({ payload }) {
    if (mySide === 'left') return;
    if (payload) latestState = payload;
}

// ================================================================
// 6. Input
// ================================================================
function sendFlap(double) {
    if (mySide === 'left') {
        if (!hostGame || !hostGame.started || hostGame.gameOver) return;
        const p = hostGame.players.left;
        if (!p.alive) return;
        p.vy = double ? WORLD.lift * 2 : WORLD.lift;
    } else {
        if (!matchChannel) return;
        matchChannel.send({
            type: 'broadcast',
            event: 'flap',
            payload: { side: 'right', double: !!double },
        });
    }
}

function handleFlap({ payload }) {
    if (mySide !== 'left') return;
    if (!hostGame || !hostGame.started || hostGame.gameOver) return;
    if (!payload || payload.side === 'left') return;
    const p = hostGame.players.right;
    if (!p || !p.alive) return;
    p.vy = payload.double ? WORLD.lift * 2 : WORLD.lift;
}

window.addEventListener('keydown', (e) => {
    if (gameScreen.classList.contains('hidden')) return;
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault(); sendFlap(false);
    } else if (e.code === 'KeyE') {
        e.preventDefault(); sendFlap(true);
    }
});
window.addEventListener('touchstart', (e) => {
    if (gameScreen.classList.contains('hidden')) return;
    e.preventDefault(); sendFlap(false);
}, { passive: false });
leftCanvas .addEventListener('mousedown', () => { if (mySide === 'left')  sendFlap(false); });
rightCanvas.addEventListener('mousedown', () => { if (mySide === 'right') sendFlap(false); });

// ================================================================
// 7. Rendering
// ================================================================
function resizeCanvases() {
    for (const c of [leftCanvas, rightCanvas]) {
        const rect = c.getBoundingClientRect();
        const w = Math.floor(rect.width)  || Math.floor(window.innerWidth / 2);
        const h = Math.floor(rect.height) || Math.floor(window.innerHeight - 80);
        c.width  = Math.max(320, w);
        c.height = Math.max(320, h);
    }
}
window.addEventListener('resize', resizeCanvases);

function drawPaneFor(ctx, side) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    if (!world) return;
    const sx = w / world.width;
    const sy = h / world.height;

    if (images.bg.complete && images.bg.naturalWidth) ctx.drawImage(images.bg, 0, 0, w, h);
    else { ctx.fillStyle = '#70c5ce'; ctx.fillRect(0, 0, w, h); }

    if (!latestState) return;

    for (const pipe of latestState.pipes) {
        const px = pipe.x * sx;
        const pw = world.pipeWidth * sx;
        const gapTop    = pipe.gapY * sy;
        const gapBottom = (pipe.gapY + world.gapHeight) * sy;
        if (images.upperPipe.complete && images.upperPipe.naturalWidth)
            ctx.drawImage(images.upperPipe, px, 0, pw, gapTop);
        else { ctx.fillStyle = '#2e8b57'; ctx.fillRect(px, 0, pw, gapTop); }
        if (images.lowerPipe.complete && images.lowerPipe.naturalWidth)
            ctx.drawImage(images.lowerPipe, px, gapBottom, pw, h - gapBottom);
        else { ctx.fillStyle = '#2e8b57'; ctx.fillRect(px, gapBottom, pw, h - gapBottom); }
    }

    const p = latestState.players[side];
    if (!p) return;
    const bx = world.birdX * sx, by = p.y * sy;
    const bw = world.birdSize * sx, bh = world.birdSize * sy;
    ctx.save();
    if (!p.alive) ctx.globalAlpha = 0.35;
    if (images.bird.complete && images.bird.naturalWidth)
        ctx.drawImage(images.bird, bx, by, bw, bh);
    else { ctx.fillStyle = side === 'left' ? '#ef476f' : '#118ab2'; ctx.fillRect(bx, by, bw, bh); }
    ctx.restore();

    ctx.fillStyle = side === 'left' ? '#e53935' : '#1e79a8';
    ctx.font = "12px 'Press Start 2P', monospace";
    ctx.textBaseline = 'top';
    ctx.fillText(side === mySide ? 'YOU' : 'OPPONENT', 12, 14);

    if (!p.alive) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, w, h);
        ctx.textAlign = 'center';
        ctx.font = "36px 'Press Start 2P', monospace";
        ctx.fillStyle = '#e53935'; ctx.fillText('DEAD', w/2 + 4, h/2 - 16);
        ctx.fillStyle = '#ffeb3b'; ctx.fillText('DEAD', w/2,     h/2 - 20);
        ctx.font = "12px 'Press Start 2P', monospace";
        ctx.fillStyle = '#bbdefb'; ctx.fillText(`SCORE  ${p.score}`, w/2, h/2 + 26);
        ctx.textAlign = 'start';
    }
}

function updateHud() {
    if (!latestState) return;
    const l = latestState.players.left, r = latestState.players.right;
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
        drawPaneFor(leftCtx,  'left');
        drawPaneFor(rightCtx, 'right');
        updateHud();
        requestAnimationFrame(renderLoop);
    }
}

// ================================================================
// 8. Game over + result screen
// ================================================================
function handleGameOver({ payload }) {
    if (!payload) return;
    const { winner, scores } = payload;
    latestState = latestState || { players: {} };
    if (hostGame && hostGame.timer) {
        clearInterval(hostGame.timer);
        hostGame.timer = null;
        hostGame.gameOver = true;
    }
    showResult(winner, scores);
    if (mySide && scores && typeof scores[mySide] === 'number') {
        submitMultiplayerScore(scores[mySide]);
    }
}

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

function handleOpponentLeft() {
    if (opponentLeft) return;
    opponentLeft = true;
    opponentLeftMsg.classList.remove('hidden');
    if (hostGame && hostGame.timer) {
        clearInterval(hostGame.timer);
        hostGame.timer = null;
        hostGame.gameOver = true;
    }
    showResult('tie', { left: 0, right: 0 });
}

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
        const iWon = winner === mySide;
        title.textContent = iWon ? 'YOU WIN!' : 'YOU LOSE';
        title.classList.add(winner === 'left' ? 'winner-left' : 'winner-right');
    }

    const lp = latestState && latestState.players.left;
    const rp = latestState && latestState.players.right;
    document.getElementById('resLeftName').textContent  = lp ? (lp.name || '').toUpperCase() : '-';
    document.getElementById('resRightName').textContent = rp ? (rp.name || '').toUpperCase() : '-';
    document.getElementById('resLeftScore').textContent  = scores && scores.left  != null ? scores.left  : (lp ? lp.score : 0);
    document.getElementById('resRightScore').textContent = scores && scores.right != null ? scores.right : (rp ? rp.score : 0);

    showScreen(resultScreen);
}

// ================================================================
// 9. Play-again & cleanup
// ================================================================
playAgainBtn.addEventListener('click', () => {
    cleanup();
    location.reload();
});

function cleanup() {
    cancelMatchmaking();
    if (matchChannel) {
        try { matchChannel.untrack().catch(() => {}); } catch (_) {}
        try { matchChannel.unsubscribe().catch(() => {}); } catch (_) {}
        matchChannel = null;
    }
    if (hostGame && hostGame.timer) {
        clearInterval(hostGame.timer);
        hostGame.timer = null;
    }
}

window.addEventListener('beforeunload', cleanup);
