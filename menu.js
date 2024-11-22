document.addEventListener("DOMContentLoaded", () => {
    // Utility Functions
    function showElement(element) {
        element.classList.remove("hidden");
    }

    function hideElement(element) {
        element.classList.add("hidden");
    }

    // Show Sign-Up Modal
    function showSignUp() {
        showElement(signUpForm);
        hideElement(authOptions);
    }

    // Show Login Modal
    function showLogin() {
        showElement(loginForm);
        hideElement(authOptions);
    }

    // Switch to Game Screen
    function switchToGame() {
        hideElement(mainContainer);  // Hide the main menu
        showElement(gameContainer);  // Show the game container
        startGame();  // Initialize the game
    }

    // DOM Elements
    const mainContainer = document.querySelector(".main-container");
    const gameContainer = document.getElementById("game-container");
    const startGameBtn = document.getElementById("startGameBtn");
    const guestBtn = document.getElementById("guestBtn");
    const authOptions = document.getElementById("authOptions");
    const signUpBtn = document.getElementById("signUpBtn");
    const loginBtn = document.getElementById("loginBtn");
    const signUpForm = document.getElementById("signUpForm");
    const loginForm = document.getElementById("loginForm");
    const submitSignUp = document.getElementById("submitSignUp");
    const submitLogin = document.getElementById("submitLogin");

    // Event Listeners
    startGameBtn.addEventListener("click", () => {
        showElement(authOptions);  // Show the authentication options
        hideElement(startGameBtn);  // Hide the Start Game button
        hideElement(guestBtn);      // Hide the Play as Guest button
    });

    guestBtn.addEventListener("click", () => {
        alert("Playing as Guest!");
        switchToGame();  // Directly start the game for guest play
    });

    signUpBtn.addEventListener("click", showSignUp);
    loginBtn.addEventListener("click", showLogin);

    submitSignUp.addEventListener("click", () => {
        const username = document.getElementById("signUpUsername").value;
        const email = document.getElementById("signUpEmail").value;
        const password = document.getElementById("signUpPassword").value;

        if (username && email && password) {
            alert(`Sign Up successful! Welcome, ${username}`);
            switchToGame();
        } else {
            alert("Please fill in all fields!");
        }
    });

    submitLogin.addEventListener("click", () => {
        const username = document.getElementById("loginUsername").value;
        const password = document.getElementById("loginPassword").value;

        if (username && password) {
            alert(`Login successful! Welcome back, ${username}`);
            switchToGame();
        } else {
            alert("Please fill in all fields!");
        }
    });

    // Function to start the game
    function startGame() {
        console.log("Game started!");
        // Add game logic initialization here
    }
});
