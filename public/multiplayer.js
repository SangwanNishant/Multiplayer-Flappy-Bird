document.addEventListener('DOMContentLoaded', () => {
  const nameEl = document.getElementById('playerName');
  const backBtn = document.getElementById('mpBackBtn');

  const username = sessionStorage.getItem('username');
  const mode = sessionStorage.getItem('mode');

  if (nameEl) {
    if (username && mode === 'USER') {
      nameEl.textContent = `Player: ${username}`;
    } else if (username && mode === 'GUEST') {
      nameEl.textContent = 'Player: Guest';
    } else {
      nameEl.textContent = 'Player: Guest';
    }
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      // Logged-in users go back to /user, guests to the guest mode picker,
      // and anyone with no session bounces to the home menu.
      if (username && mode === 'USER') {
        window.location.href = '/user';
      } else if (mode === 'GUEST') {
        window.location.href = '/option-mode-guest';
      } else {
        window.location.href = '/';
      }
    });
  }
});
