document.addEventListener('DOMContentLoaded', ()=>{
    async function submitScoreAndFetchLeaderboard(){
        let username = sessionStorage.getItem('username') || 'GUEST'; // Retrieve username from sessionStorage or default to 'GUEST'
        const score = sessionStorage.getItem('finalScore'); // Retrieve the score from sessionStorage

        if (!score) {
            console.error("No score found in sessionStorage");
            return;
        }
        try {
            const response =   await fetch('/submit-score',{
                method: 'POST',
                headers:{ 'Content-Type':'application/json'},
                body:JSON.stringify({username, score}),
            })

            const data = await response.json();

            if(response.ok){
                displayLeaderboard(data.leaderboard);
            } else{
                console.log("error: ", data.message);
            }

        } catch (error) {
            console.log("error: ", error);
        }
    }

    function displayLeaderboard(leaderboard){
        if (!Array.isArray(leaderboard)) {
            console.error("Invalid leaderboard data received:", leaderboard);
            return;
        }
        const leaderboardTable  = document.getElementById("Leaderboard-table");
        leaderboardTable.innerHTML= "";

        leaderboard.forEach((entry,index) => {
            if (!entry || typeof entry.score === "undefined" || typeof entry.username === "undefined") {
                console.warn(`Skipping invalid leaderboard entry at index ${index}:`, entry);
                return; // Skip invalid entries
            }
    
            console.log(`Player: ${entry.username}, Score: ${entry.score}`);
            
    
            const row = `<tr>
            <td>${index + 1}</td>
            <td>${entry.username}</td>
            <td>${entry.score}</td>
        </tr>`;
        leaderboardTable.innerHTML += row;
        });
    }

    const menuBtn = document.getElementById('back-to-main-menu-btn');
const restartBtn = document.getElementById('restart-btn');

try {
    const token = sessionStorage.getItem("authToken");
    
    if (!token) {
        console.log("No token found. Redirect to login or guest flow.");
        // window.location.href = "/"; // Redirect to login if no token
        return;
    }

    // Decode the token
    const decoded = jwt_decode(token);
    console.log(decoded.mode); // Outputs 'GUEST' or 'USER'

    // Check if token has expired
    const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
    const bufferTime = 30; // 30 seconds buffer
    if (decoded.exp < currentTime - bufferTime) {
        console.log("Token expired. Redirecting to login.");
        sessionStorage.removeItem("authToken");
        // window.location.href = "/"; // Redirect to login
        return;
    }

    // Add button functionality based on user mode
    if (decoded.mode === 'GUEST') {
            restartBtn.addEventListener('click', () => {
                window.location.href = "/guest-game";
            });
            menuBtn.addEventListener('click', () => {
                window.location.href = "/";
            });
    } else if (decoded.mode === 'USER') {
            restartBtn.addEventListener('click', () => {
                window.location.href = "/user-game";
            });
            menuBtn.addEventListener('click', () => {
                window.location.href = "/user";
            });
        }
    } catch (error) {
        console.error("An error occurred:", error);
        // Optionally redirect to an error page or login
        // window.location.href = "/";
    }


        submitScoreAndFetchLeaderboard()
})