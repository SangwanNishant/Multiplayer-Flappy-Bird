document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const mainContainer = document.querySelector(".main-container");
    const gameContainer = document.getElementById("game-container");
    const submitSignUp = document.getElementById("submitSignUp");
    const submitLoginBtn = document.getElementById("submitLogin");
    const startGameBtn = document.getElementById("startGameBtn");
    const guestBtn = document.getElementById("guestBtn");
    const authOptions = document.getElementById("authOptions");
    const signUpForm = document.getElementById("signUpForm");
    const loginForm = document.getElementById("loginForm");
  
    // Utility Functions
    function showElement(element) {
      element.classList.remove("hidden");
    }
  
    function hideElement(element) {
      element.classList.add("hidden");
    }
  
    function switchToGame() {
      hideElement(mainContainer); // Hide the menu
      showElement(gameContainer); // Show the game container
      console.log("Game is starting...");
      // Define your game initialization logic here
      // startGame();
    }
  
    // API Call Functions
    async function submitSignup() {
      const username = document.getElementById("signUpUsername").value.trim();
      const password = document.getElementById("signUpPassword").value.trim();
  
      if (!username || !password) {
        alert("Please fill in both username and password.");
        return;
      }
  
      try {
        const response = await fetch("http://localhost:5000/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
  
        const result = await response.json();
        alert(result.message);
  
        if (response.ok) {
          console.log("Signup successful, redirecting...");
          setTimeout(() => (window.location.href = "/game"), 1500);
        }
      } catch (error) {
        console.error("Signup Error:", error);
        alert("An error occurred during signup. Please try again.");
      }
    }
  
    async function submitLogin() {
      const username = document.getElementById("loginUsername").value.trim();
      const password = document.getElementById("loginPassword").value.trim();
  
      if (!username || !password) {
        alert("Please fill in both username and password.");
        return;
      }
  
      try {
        const response = await fetch("http://localhost:5000/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
  
        const result = await response.json();
        alert(result.message);
  
        if (response.ok) {
          console.log("Login successful, redirecting...");
          setTimeout(() => (window.location.href = "/game"), 1500);
        }
      } catch (error) {
        console.error("Login Error:", error);
        alert("An error occurred during login. Please try again.");
      }
    }
  
    // Event Listeners
    startGameBtn.addEventListener("click", () => {
      console.log("Showing authentication options...");
      showElement(authOptions);
      hideElement(startGameBtn);
      hideElement(guestBtn);
    });
  
    guestBtn.addEventListener("click", () => {
      alert("Playing as Guest!");
      console.log("Game starting for guest...");
      setTimeout(switchToGame, 2000); // Start the game for guest play after a delay
    });
  
    document.getElementById("signUpBtn").addEventListener("click", () => {
      showElement(signUpForm);
      hideElement(authOptions);
    });
  
    document.getElementById("loginBtn").addEventListener("click", () => {
      showElement(loginForm);
      hideElement(authOptions);
    });
  
    submitSignUp.addEventListener("click", submitSignup);
    submitLoginBtn.addEventListener("click", submitLogin);
  
    // Show menu on initial load
    console.log("Displaying menu...");
    showElement(mainContainer);
    hideElement(gameContainer);
  });
  