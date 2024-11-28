document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const mainMenu = document.getElementById("main-menu");
    const authOptions = document.getElementById("authOptions");
    const signUpForm = document.getElementById("signUpForm");
    const loginForm = document.getElementById("loginForm");
    const gameContainer = document.getElementById("game-container");
    const guestBtn = document.getElementById("guestBtn");
    const startGameBtn = document.getElementById("startGameBtn");
    const signUpBtn = document.getElementById("signUpBtn");
    const loginBtn = document.getElementById("loginBtn");
    const submitSignUp = document.getElementById("submitSignUp");
    const submitLogin = document.getElementById("submitLogin");
  
    // Utility Functions
    function showElement(element) {
      element.classList.remove("hidden");
    }
  
    function hideElement(element) {
      element.classList.add("hidden");
    }
  

  
    signUpBtn.addEventListener("click", () => {
      console.log("Showing sign-up form");
      hideElement(authOptions);
      showElement(signUpForm);
    });
  
    loginBtn.addEventListener("click", () => {
      console.log("Showing login form");
      hideElement(authOptions);
      showElement(loginForm);
    });
  
    submitSignUp.addEventListener("click", async () => {
      const username = document.getElementById("signUpUsername").value.trim();
      const password = document.getElementById("signUpPassword").value.trim();
      const email = document.getElementById("signUpEmail").value.trim();
  
      if (!username || !password || !email) {
        alert("Please fill out both fields");
        return;
      }
  
      try {
        const response = await fetch(`/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, email }),
        });
  
        const result = await response.json();
        alert(result.message);
  
        if (response.ok){
          window.location.href = `/user`
        }
      } catch (err) {
        console.error(err);
        alert("Error during signup. Please try again.");
      }
    });
  
    submitLogin.addEventListener("click", async () => {
      const username = document.getElementById("loginUsername").value.trim();
      const password = document.getElementById("loginPassword").value.trim();
  
      if (!username || !password) {
        alert("Please fill out both fields");
        return;
      }
  
      try {
        const response = await fetch(`/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
  
        const result = await response.json();
        alert(result.message);
  
        if (response.ok) {
          window.location.href = `/user`
        }
      } catch (err) {
        console.error(err);
        alert("Error during login. Please try again.");
      }
    });
  });
  