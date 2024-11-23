
document.addEventListener("DOMContentLoaded", () => {

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    document.body.appendChild(canvas);

    // Function to resize the canvas and fill the screen
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    // Initialize canvas and listen for resize
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // Loading assets
    const birdImg = new Image();
    birdImg.src = "assets/bird.png";

    const bgImg = new Image();
    bgImg.src = "assets/bg.png";

    const upperPipeImg = new Image();
    upperPipeImg.src = "assets/upperPipe.png";

    const lowerPipeImg = new Image();
    lowerPipeImg.src = "assets/lowerPipe.png";

    // Bird properties
    const bird = {
        x: 100,
        y: 100,
        size: 30,
        gravity: 0.3,
        lift: -5,
        velocity: 0,
        termainalVelocity: 0.4
    };

    // Pipe properties
    const pipeWidth = 75;
    const gapHeight = 150;
    const pipeSpeed = 3;
    let upperPipes = [];
    let lowerPipes = [];

    // Game state
    let isGameOver = false;
    let score = 0;
    let gameFrameId = null; // Store the requestAnimationFrame ID

    // Initialize the game state
    function init() {
        bird.y = 100;
        bird.velocity = 0;
        upperPipes = [];
        lowerPipes = [];
        score = 0;
        isGameOver = false;

    }

    // Spawn new pipes
    function spawnPipe() {
        const topHeight = Math.random() * (canvas.height - gapHeight - 200) + 100;
        const bottomY = topHeight + gapHeight;

        upperPipes.push({
            x: canvas.width,
            y: 0,
            width: pipeWidth,
            height: topHeight,
        });

        lowerPipes.push({
            x: canvas.width,
            y: bottomY,
            width: pipeWidth,
            height: canvas.height - bottomY,
        });
    }

    // Update bird and pipes
    function update() {
        if (isGameOver) return;

        // Bird physics
        bird.velocity += bird.gravity;
        if (bird.velocity > bird.terminalVelocity) {
            bird.velocity = bird.terminalVelocity;
        }
        bird.y += bird.velocity;

        // Prevent the bird from going off the screen
        if (bird.y + bird.size > canvas.height || bird.y < 0) {
            gameOver();
        }

        // Update pipes
        upperPipes.forEach(pipe => pipe.x -= pipeSpeed);
        lowerPipes.forEach(pipe => pipe.x -= pipeSpeed);

        // Remove pipes that go off-screen
        upperPipes = upperPipes.filter(pipe => pipe.x + pipeWidth > 0);
        lowerPipes = lowerPipes.filter(pipe => pipe.x + pipeWidth > 0);

        // Spawn new pipes
        if (upperPipes.length === 0 || upperPipes[upperPipes.length - 1].x < canvas.width - 300) {
            spawnPipe();
        }

        // Check for score
        upperPipes.forEach(pipe => {
            if (pipe.x + pipeWidth < bird.x && !pipe.passed) {
                pipe.passed = true;
                score += 50;
            }
        });

        checkCollisions();
    }

    // Check for collisions
    function checkCollisions() {
        upperPipes.forEach(pipe => {
            const isCollidingX = bird.x + bird.size > pipe.x && bird.x < pipe.x + pipe.width;
            const isCollidingY = bird.y < pipe.height;

            if (isCollidingX && isCollidingY) {
                gameOver();
            }
        });

        lowerPipes.forEach(pipe => {
            const isCollidingX = bird.x + bird.size > pipe.x && bird.x < pipe.x + pipe.width;
            const isCollidingY = bird.y + bird.size > pipe.y;

            if (isCollidingX && isCollidingY) {
                gameOver();
            }
        });
    }

    function showElement(element) {
        element.classList.remove("hidden");
        // element.style.display = "flex"; // Ensure it overrides any hidden styles
    }    

    function hideElement(element) {
        element.classList.add("hidden");
      }
    
    const gameovermodal = document.getElementById("gameOverModal")

    // game over case
    function gameOver() {
        isGameOver = true;
        console.log("Game Over triggered");
        const scoreElement = document.getElementById('finalScore');
        scoreElement.textContent = `${Math.floor(score)}`;
        console.log("Score updated");
        showElement(gameovermodal);
        console.log("Game Over Modal shown");
        cancelAnimationFrame(gameFrameId);
    }
    

    // // Show the game over modal and score
    // function showGameOverModal() {
    //     const scoreElement = document.getElementById('finalScore');
    //     scoreElement.textContent = `${Math.floor(score)}`;
    //     showElement(gameovermodal);
    // }

    
    // Handle game restart
    function restartGame() {
        hideElement(gameovermodal);
        init();
    }

    // Draw bird, pipes, and background
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

        // Draw "Flappy Bird" text
        ctx.font = "bold 50px Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("Flappy Bird", 20, 20);

        // Draw bird
        ctx.drawImage(birdImg, bird.x, bird.y, bird.size, bird.size);

        // Draw upper pipes
        upperPipes.forEach(pipe => {
            ctx.drawImage(upperPipeImg, pipe.x, pipe.y, pipe.width, pipe.height);
        });

        // Draw lower pipes
        lowerPipes.forEach(pipe => {
            ctx.drawImage(lowerPipeImg, pipe.x, pipe.y, pipe.width, pipe.height);
        });

        // Draw score
        ctx.font = "bold 30px Arial";
        ctx.fillText("Score: " + score, canvas.width - 180, 50);
    }

    // Start the game loop
    function startGame() {
        init();
        loop();
    }

    // Main game loop
    function loop() {
        update();
        draw();
        gameFrameId = requestAnimationFrame(loop);
    }

    // Handle bird jump
    window.addEventListener("keydown", e => {
        if (e.code === "Space" && !isGameOver) {
            bird.velocity = bird.lift;
        }
    });

    // Handle bird double jump
    window.addEventListener("keydown", e => {
        if (e.code === "KeyE" && !isGameOver) {
            bird.velocity = bird.lift * 2;
        }
    });

    window.addEventListener("touchstart", e => {
        e.preventDefault(); // Prevents the default action of the touch event (e.g., scrolling)
        if (!isGameOver) {
            bird.velocity = bird.lift; // Makes the bird jump
        }
    });

    // Prevent scrolling on touch hold and move
    window.addEventListener("touchmove", e => {
        e.preventDefault(); // Prevents touch move scrolling
    });


    const restartgamebtn = document.getElementById("restartBtn") 

    restartgamebtn.addEventListener("click",()=>{
        restartGame();
    })

    startGame()
})