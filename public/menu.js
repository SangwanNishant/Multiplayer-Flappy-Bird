// ================================================================
// Sign-up / Login form handling for /start
//
// Replaces the original alert()-based flow with:
//   - inline status messages (no blocking popups)
//   - basic client-side validation before hitting the server
//   - clear error messages based on server response status
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    // If the logged-in view (user-menu.html) is using this script, bail out early.
    const isAuthPage = !!document.getElementById('signUpBtn') && !!document.getElementById('loginBtn');
    if (!isAuthPage) return;

    // ------------ DOM refs ------------
    const authOptions = document.getElementById('authOptions');
    const signUpForm  = document.getElementById('signUpForm');
    const loginForm   = document.getElementById('loginForm');
    const paneTitle   = document.getElementById('paneTitle');

    const signUpBtn   = document.getElementById('signUpBtn');
    const loginBtn    = document.getElementById('loginBtn');
    const submitSignUp = document.getElementById('submitSignUp');
    const submitLogin  = document.getElementById('submitLogin');

    const signUpUsername = document.getElementById('signUpUsername');
    const signUpPassword = document.getElementById('signUpPassword');
    const loginUsername  = document.getElementById('loginUsername');
    const loginPassword  = document.getElementById('loginPassword');

    const signUpStatus = document.getElementById('signUpStatus');
    const loginStatus  = document.getElementById('loginStatus');

    const switchToLogin  = document.getElementById('switchToLogin');
    const switchToSignup = document.getElementById('switchToSignup');

    // ------------ Helpers ------------
    function show(el) { el.classList.remove('hidden'); }
    function hide(el) { el.classList.add('hidden'); }

    function setStatus(el, kind, message) {
        el.className = 'status ' + kind;
        el.textContent = message;
    }
    function clearStatus(el) {
        el.className = 'status';
        el.textContent = '';
    }

    function markError(inputs, flag) {
        for (const i of inputs) {
            if (flag) i.classList.add('error');
            else i.classList.remove('error');
        }
    }

    function setBusy(btn, busy, idleText) {
        btn.disabled = busy;
        btn.textContent = busy ? 'PLEASE WAIT...' : idleText;
    }

    // Validate a username: 3-20 chars, letters/digits/underscore only.
    function validateUsername(u) {
        if (!u) return 'Username is required.';
        if (u.length < 3) return 'Username must be at least 3 characters.';
        if (u.length > 20) return 'Username must be at most 20 characters.';
        if (!/^[A-Za-z0-9_]+$/.test(u)) return 'Only letters, numbers and underscores.';
        return null;
    }
    function validatePassword(p, { minLen = 6 } = {}) {
        if (!p) return 'Password is required.';
        if (p.length < minLen) return `Password must be at least ${minLen} characters.`;
        return null;
    }

    // Map a fetch response to a user-friendly error message.
    function friendlyError(status, serverMessage) {
        switch (status) {
            case 400: return serverMessage || 'Please check your inputs.';
            case 401: return 'Wrong username or password.';
            case 404: return 'No account with that username.';
            case 409: return 'That username is already taken.';
            case 422: return serverMessage || 'Invalid credentials.';
            case 500: return 'Server error. Please try again in a moment.';
            default:  return serverMessage || 'Something went wrong.';
        }
    }

    // ------------ Screen switching ------------
    function showAuthOptions() {
        clearStatus(signUpStatus);
        clearStatus(loginStatus);
        show(authOptions); hide(signUpForm); hide(loginForm);
        if (paneTitle) paneTitle.textContent = 'CHOOSE AN OPTION';
    }
    function showSignUp() {
        clearStatus(signUpStatus);
        hide(authOptions); show(signUpForm); hide(loginForm);
        if (paneTitle) paneTitle.textContent = 'CREATE ACCOUNT';
        setTimeout(() => signUpUsername.focus(), 0);
    }
    function showLogin() {
        clearStatus(loginStatus);
        hide(authOptions); hide(signUpForm); show(loginForm);
        if (paneTitle) paneTitle.textContent = 'LOGIN';
        setTimeout(() => loginUsername.focus(), 0);
    }

    signUpBtn.addEventListener('click', showSignUp);
    loginBtn.addEventListener('click', showLogin);
    if (switchToLogin)  switchToLogin.addEventListener('click', showLogin);
    if (switchToSignup) switchToSignup.addEventListener('click', showSignUp);

    // Back buttons inside the forms return to the initial auth options screen.
    const signupBack = document.getElementById('signupBack');
    const loginBack  = document.getElementById('loginBack');
    if (signupBack) signupBack.addEventListener('click', showAuthOptions);
    if (loginBack)  loginBack.addEventListener('click',  showAuthOptions);

    // Pressing Enter submits the active form
    signUpForm.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitSignUp.click(); } });
    loginForm.addEventListener('keydown',  e => { if (e.key === 'Enter') { e.preventDefault(); submitLogin.click();  } });

    // ------------ Submit: Sign Up ------------
    submitSignUp.addEventListener('click', async () => {
        const username = signUpUsername.value.trim();
        const password = signUpPassword.value;

        markError([signUpUsername, signUpPassword], false);

        const uErr = validateUsername(username);
        const pErr = validatePassword(password, { minLen: 6 });
        if (uErr) { markError([signUpUsername], true); setStatus(signUpStatus, 'err', uErr); signUpUsername.focus(); return; }
        if (pErr) { markError([signUpPassword], true); setStatus(signUpStatus, 'err', pErr); signUpPassword.focus(); return; }

        setBusy(submitSignUp, true, 'CREATE ACCOUNT');
        setStatus(signUpStatus, 'info', 'Creating account...');

        try {
            const response = await fetch('/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const result = await response.json().catch(() => ({}));

            if (response.ok) {
                sessionStorage.setItem('authToken', result.token);
                sessionStorage.setItem('username', result.username);
                sessionStorage.setItem('mode', 'USER');
                setStatus(signUpStatus, 'ok', 'Account created! Redirecting...');
                setTimeout(() => { window.location.href = '/user'; }, 600);
            } else {
                const msg = friendlyError(response.status, result && result.message);
                setStatus(signUpStatus, 'err', msg);
                if (response.status === 409) markError([signUpUsername], true);
            }
        } catch (err) {
            console.error('[signup] network error', err);
            setStatus(signUpStatus, 'err', 'Network error. Is the server running?');
        } finally {
            setBusy(submitSignUp, false, 'CREATE ACCOUNT');
        }
    });

    // ------------ Submit: Login ------------
    submitLogin.addEventListener('click', async () => {
        const username = loginUsername.value.trim();
        const password = loginPassword.value;

        markError([loginUsername, loginPassword], false);

        if (!username || !password) {
            setStatus(loginStatus, 'err', 'Enter your username and password.');
            markError([!username ? loginUsername : null, !password ? loginPassword : null].filter(Boolean), true);
            return;
        }

        setBusy(submitLogin, true, 'LOGIN');
        setStatus(loginStatus, 'info', 'Logging in...');

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const result = await response.json().catch(() => ({}));

            if (response.ok) {
                sessionStorage.setItem('authToken', result.token);
                sessionStorage.setItem('username', result.username);
                sessionStorage.setItem('mode', 'USER');
                setStatus(loginStatus, 'ok', 'Welcome back! Redirecting...');
                setTimeout(() => { window.location.href = '/user'; }, 500);
            } else {
                const msg = friendlyError(response.status, result && result.message);
                setStatus(loginStatus, 'err', msg);
                if (response.status === 401 || response.status === 404) {
                    markError([loginUsername, loginPassword], true);
                }
            }
        } catch (err) {
            console.error('[login] network error', err);
            setStatus(loginStatus, 'err', 'Network error. Is the server running?');
        } finally {
            setBusy(submitLogin, false, 'LOGIN');
        }
    });

    // Reset "error" outline as the user edits a field again.
    for (const input of [signUpUsername, signUpPassword, loginUsername, loginPassword]) {
        input.addEventListener('input', () => input.classList.remove('error'));
    }
});
