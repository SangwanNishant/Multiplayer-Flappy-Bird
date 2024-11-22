// Wait for the DOM to load before adding event listeners
document.addEventListener("DOMContentLoaded", function() {

    // Get elements from the DOM
    const startGameButton = document.getElementById('start-game');
    const playAsGuestButton = document.getElementById('play-as-guest');
    const signUpButton = document.getElementById('sign-up-btn');
    const loginButton = document.getElementById('login-btn');
    const startMenu = document.getElementById('start-menu');
    const signUpForm = document.getElementById('signUpForm');
    const loginForm = document.getElementById('loginForm');
    const gameContainer = document.getElementById('game-container');

    // Button listeners for Start Game and Play as Guest
    startGameButton.addEventListener('click', function() {
        // Hide start menu and show the forms
        startMenu.classList.add('hidden');
        signUpForm.classList.remove('hidden');
        loginForm.classList.remove('hidden');
    });

    playAsGuestButton.addEventListener('click', function() {
        // Hide start menu and directly show game container
        startMenu.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        // Implement guest logic here if necessary
    });

    // Show sign-up form when Sign Up button is clicked
    signUpButton.addEventListener('click', function() {
        // Display sign-up form, hide login form
        signUpForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    });

    // Show login form when Login button is clicked
    loginButton.addEventListener('click', function() {
        // Display login form, hide sign-up form
        signUpForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    // Handle Form Submission (Just example, can be extended to include validation)
    const signUpSubmit = document.getElementById('submitSignUp');
    const loginSubmit = document.getElementById('submitLogin');

    // For Sign-Up form submission (you can extend this with actual validation or API calls)
    signUpSubmit.addEventListener('click', function(event) {
        event.preventDefault();
        const username = document.getElementById('sign-up-username').value;
        const email = document.getElementById('sign-up-email').value;
        const password = document.getElementById('sign-up-password').value;
        
        // Do something with the data, e.g., send to server (use AJAX or Fetch API)
        console.log(`Signing up: ${username}, ${email}, ${password}`);

        // Hide the sign-up form and show the game container
        signUpForm.classList.add('hidden');
        gameContainer.classList.remove('hidden');
    });

    // For Login form submission (similarly, you can extend this)
    loginSubmit.addEventListener('click', function(event) {
        event.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        
        // Do something with the data (e.g., authenticate user)
        console.log(`Logging in: ${username}, ${password}`);

        // Hide the login form and show the game container
        loginForm.classList.add('hidden');
        gameContainer.classList.remove('hidden');
    });

});
