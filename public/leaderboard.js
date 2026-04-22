// ================================================================
// Leaderboard page
// - submits the just-played score (if any) to the correct mode
// - shows two tabs (SOLO / MULTIPLAYER), each fetched independently
// - "PLAY AGAIN" routes back to the mode the player was actually in
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    const VALID_MODES = ['SOLO', 'MULTIPLAYER'];

    const tbody       = document.getElementById('Leaderboard-table');
    const emptyMsg    = document.getElementById('lbEmpty');
    const youBox      = document.getElementById('player-data-box');
    const tabButtons  = Array.from(document.querySelectorAll('.lb-tab'));
    const restartBtn  = document.getElementById('restart-btn');
    const menuBtn     = document.getElementById('back-to-main-menu-btn');

    // Session context -----------------------------------------------------
    const token    = sessionStorage.getItem('authToken');
    const username = sessionStorage.getItem('username') || 'GUEST';
    const storedMode = (sessionStorage.getItem('gameMode') || '').toUpperCase();
    const lastMode = VALID_MODES.includes(storedMode) ? storedMode : 'SOLO';

    // 'mode' in sessionStorage is the account type (USER|GUEST), set at login
    // time by menu.js / redirectFunc.js. Previously we decoded the JWT; since
    // the Supabase migration the token is opaque, so just read the flag.
    const accountMode = (sessionStorage.getItem('mode') || '').toUpperCase();
    const isUser = accountMode === 'USER';

    // Decide where the back & restart buttons go based on who you are +
    // what you last played.
    function backTarget() {
        if (isUser) return '/user';
        if (token)  return '/option-mode-guest'; // guest logged in
        return '/';
    }
    function restartTarget() {
        if (lastMode === 'MULTIPLAYER') return '/multiplayer';
        return isUser ? '/user-game' : (token ? '/guest-game' : '/');
    }
    restartBtn.addEventListener('click', () => { window.location.href = restartTarget(); });
    menuBtn.addEventListener('click',    () => { window.location.href = backTarget();    });

    // Tab switching -------------------------------------------------------
    let currentMode = lastMode;

    function setActiveTab(mode) {
        currentMode = mode;
        for (const b of tabButtons) {
            b.classList.toggle('active', b.dataset.mode === mode);
        }
    }

    for (const b of tabButtons) {
        b.addEventListener('click', () => {
            if (b.dataset.mode === currentMode) return;
            setActiveTab(b.dataset.mode);
            loadLeaderboard(currentMode);
        });
    }

    // Render --------------------------------------------------------------
    function renderLeaderboard(list, highlightName) {
        tbody.innerHTML = '';
        const rows = Array.isArray(list) ? list : [];

        if (rows.length === 0) {
            emptyMsg.classList.remove('hidden');
            return;
        }
        emptyMsg.classList.add('hidden');

        for (let i = 0; i < rows.length; i++) {
            const entry = rows[i];
            if (!entry || typeof entry.score === 'undefined' || typeof entry.username === 'undefined') continue;

            const tr = document.createElement('tr');
            if (i === 0) tr.classList.add('rank-1');
            else if (i === 1) tr.classList.add('rank-2');
            else if (i === 2) tr.classList.add('rank-3');

            if (highlightName && entry.username === highlightName) tr.classList.add('me');

            const rankTd  = document.createElement('td');
            const nameTd  = document.createElement('td');
            const scoreTd = document.createElement('td');
            rankTd.className  = 'col-rank';
            nameTd.className  = 'col-name';
            scoreTd.className = 'col-score';

            rankTd.textContent  = String(i + 1);
            nameTd.textContent  = String(entry.username).toUpperCase();
            scoreTd.textContent = String(entry.score);

            tr.appendChild(rankTd);
            tr.appendChild(nameTd);
            tr.appendChild(scoreTd);
            tbody.appendChild(tr);
        }
    }

    function showYourScore(mode, score, resolvedName) {
        if (typeof score !== 'number' || Number.isNaN(score)) {
            youBox.classList.add('hidden');
            return;
        }
        const who = resolvedName || username || 'YOU';
        youBox.textContent = `${mode} RUN — ${String(who).toUpperCase()} : ${score}`;
        youBox.classList.remove('hidden');
    }

    // Fetch only (no score submission) ------------------------------------
    async function loadLeaderboard(mode) {
        try {
            const response = await fetch(`/leaderboard-data?mode=${encodeURIComponent(mode)}`);
            const data = await response.json();
            if (response.ok) {
                renderLeaderboard(data.leaderboard, null);
            } else {
                console.warn('leaderboard fetch failed:', data && data.message);
                renderLeaderboard([], null);
            }
        } catch (err) {
            console.warn('leaderboard fetch error:', err);
            renderLeaderboard([], null);
        }
    }

    // Submit score for the mode the player just played, then render it.
    async function submitAndRender(mode) {
        const rawScore = sessionStorage.getItem('finalScore');
        const numericScore = rawScore === null ? NaN : Number(rawScore);
        if (!Number.isFinite(numericScore)) {
            // nothing to submit -> just render the table
            await loadLeaderboard(mode);
            return;
        }
        try {
            const response = await fetch('/submit-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, score: numericScore, mode }),
            });
            const data = await response.json();
            if (response.ok) {
                renderLeaderboard(data.leaderboard, data.username);
                showYourScore(mode, data.score, data.username);
            } else {
                console.warn('submit-score failed:', data && data.message);
                await loadLeaderboard(mode);
            }
        } catch (err) {
            console.warn('submit-score error:', err);
            await loadLeaderboard(mode);
        } finally {
            // Only consume the finalScore once — subsequent tab switches
            // should just read the board, not re-submit.
            sessionStorage.removeItem('finalScore');
        }
    }

    // Boot: highlight the mode they just played, submit their score to it,
    // then let them toggle freely between SOLO and MULTIPLAYER.
    setActiveTab(currentMode);
    submitAndRender(currentMode);
});
