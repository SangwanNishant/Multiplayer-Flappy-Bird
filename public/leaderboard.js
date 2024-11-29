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
    submitScoreAndFetchLeaderboard()
})