// Play as guest button function
function redirectToGame() {
    // Make a GET request to the /guest route
    fetch("/guest")
    .then(response => response.json())
    .then(data => {
        if (data.token) {
            // Store the token, username, and mode (USER or GUEST) in sessionStorage
            sessionStorage.setItem("authToken", data.token);  // Store token
            sessionStorage.setItem("username", data.username);  // Store username
            sessionStorage.setItem("mode", data.mode);  // Store mode (GUEST)

            console.log("Guest token stored:", sessionStorage.getItem("authToken"));
            alert("token set succesfully")

            // Redirect to the game page (adjust to actual game page route)
            window.location.href = "/guest-game";  // Change to your game route
        } else {
            console.error("Error: Token not found");
        }
    })
    .catch(error => {
        console.error("Error during guest login:", error);
    });
}

function redirectToStart(){
    window.location.href = "/start"
}
function redirectBackToMenu(){
    window.location.href = "/"
}
function redirectUserToGame(){
    window.location.href = "/user-game"
}
function redirectUserToMenu(){
    window.location.href = "/user"
}
function redirectGuestToMenu(){
    window.location.href = "/"
}
function redirectUserToRestartGame(){
      window.location.href = "/user-game"
  }
function redirectGuestToLeaderboard(){
    window.location.href = "/leaderboard"
}
function redirectUserToLeaderboard(){
    window.location.href = "/leaderboard"
}
function redirectToMenu(){
    window.location.href = "/"
}
function redirectGuestToRestartGame(){
      window.location.href = "/guest-game"
  }