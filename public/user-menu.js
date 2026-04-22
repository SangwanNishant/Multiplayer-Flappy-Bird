document.addEventListener('DOMContentLoaded', () => {
  const nameEl = document.getElementById('loggedInName');
  const username = sessionStorage.getItem('username');

  if (!username || !sessionStorage.getItem('authToken')) {
    // not logged in — bounce back to signup/login
    window.location.href = '/start';
    return;
  }

  if (nameEl) nameEl.textContent = (username || 'PLAYER').toUpperCase();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('username');
      sessionStorage.removeItem('mode');
      window.location.href = '/';
    });
  }
});
