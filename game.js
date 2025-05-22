// Game constants
const GRAVITY = 1.5;
const JUMP_FORCE = -25;
const GROUND_HEIGHT = 250;
const OBSTACLE_SPEED = 10;
const GRID_SCROLL_SPEED = 2;
const FPS = 60;
const FRAME_TIME = 1000 / FPS; // Time per frame in milliseconds

// Game state
let score = 0;
let isGameOver = false;
let canvas;
let ctx;
let player;
let obstacles = [];
let gameLoopId;
let gridOffset = 0; // Track grid position
let nextObstacleDelay = 0;
let isGamePaused = true; // Add a flag to track if the game is paused
let lastFrameTime = 0; // Track last frame time for FPS control

// Store keydown handler for cleanup
function gameKeydownHandler(e) {
    if (e.code === 'Space') {
        if (isGamePaused) {
            isGamePaused = false;
            gameLoop(); // Start the game loop when space is pressed
        } else if (!player?.isJumping) {
            jump();
        }
        if (isGameOver) {
            restartGame();
        }
    }
}

// Initialize game when DOM is fully loaded
function initGame() {
    console.log('Initializing game...');
    
    // Get canvas context
    canvas = document.getElementById('game-canvas');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    
    // Set canvas size
    canvas.width = 800;
    canvas.height = 400;
    
    ctx = canvas.getContext('2d');

    // Initialize player
    player = {
        x: 50,
        y: GROUND_HEIGHT,
        width: 40,
        height: 40,
        velocityY: 0,
        isJumping: false
    };

    // Event listeners - attach to the iframe's document
    document.addEventListener('keydown', gameKeydownHandler);

    // Draw initial game state
    draw();

    // Display start message
    ctx.fillStyle = '#00ff9d';
    ctx.font = 'bold 40px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 255, 157, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('Press Space To Start', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;

    // Start the game
    console.log('Game initialized!');
    window.gameInitialized = true;
}

// Game functions (globally accessible)
function jump() {
    if (!player) return;
    player.velocityY = JUMP_FORCE;
    player.isJumping = true;
}

function createObstacle() {
    if (!canvas) return;
    
    // Random dimensions within reasonable bounds
    const minHeight = 30;
    const maxHeight = 60;
    const minWidth = 15;
    const maxWidth = 30;
    
    const height = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
    const width = Math.floor(Math.random() * (maxWidth - minWidth + 1)) + minWidth;
    
    obstacles.push({
        x: canvas.width,
        y: GROUND_HEIGHT + 40 - height, // Adjust y based on height
        width: width,
        height: height
    });
    
    // Set random delay until next obstacle (between 1 and 2 seconds)
    nextObstacleDelay = Math.floor(Math.random() * 30) + 30; // 60 frames = 1 second at 60fps
}

// Helper function for smooth easing
function easeInOut(t) {
    // Smooth acceleration and deceleration
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function updatePlayer() {
    if (!player) return;
    // Apply gravity
    player.velocityY += GRAVITY;
    player.y += player.velocityY;

    // Ground collision
    if (player.y > GROUND_HEIGHT) {
        player.y = GROUND_HEIGHT;
        player.velocityY = 0;
        player.isJumping = false;
    }
}

function updateObstacles() {
    // Move obstacles at constant speed
    obstacles.forEach(obstacle => {
        obstacle.x -= OBSTACLE_SPEED;
    });

    // Remove off-screen obstacles
    obstacles = obstacles.filter(obstacle => obstacle.x + obstacle.width > 0);

    // Create new obstacles with random timing
    if (nextObstacleDelay > 0) {
        nextObstacleDelay--;
    } else if (obstacles.length === 0 || obstacles[obstacles.length - 1].x < canvas.width - 200) {
        createObstacle();
    }
}

function checkCollisions() {
    if (!player) return;
    obstacles.forEach(obstacle => {
        if (
            player.x < obstacle.x + obstacle.width &&
            player.x + player.width > obstacle.x &&
            player.y < obstacle.y + obstacle.height &&
            player.y + player.height > obstacle.y
        ) {
            gameOver();
        }
    });
}

function updateScore() {
    score++;
}

function draw() {
    if (!ctx || !canvas) return;
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update grid offset
    gridOffset = (gridOffset + GRID_SCROLL_SPEED) % 20;

    // Draw scrolling grid effect
    ctx.strokeStyle = 'rgba(0, 255, 157, 0.1)';
    ctx.lineWidth = 1;
    const gridSize = 20;
    
    // Vertical lines
    for (let x = -gridOffset; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // Draw ground with matrix effect
    ctx.beginPath();
    ctx.moveTo(0, GROUND_HEIGHT + 40);
    ctx.lineTo(canvas.width, GROUND_HEIGHT + 40);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 255, 157, 0.8)';
    ctx.stroke();

    // Draw player with neon effect
    if (player) {
        // Glow effect
        ctx.shadowColor = 'rgba(0, 255, 157, 0.5)';
        ctx.shadowBlur = 10;
        
        // Main shape
        ctx.fillStyle = 'rgba(0, 255, 157, 0.8)';
        ctx.fillRect(player.x, player.y, player.width, player.height);
        
        // Border
        ctx.strokeStyle = '#00ff9d';
        ctx.lineWidth = 2;
        ctx.strokeRect(player.x, player.y, player.width, player.height);
        
        // Reset shadow
        ctx.shadowBlur = 0;
    }

    // Draw obstacles with neon effect
    obstacles.forEach(obstacle => {
        // Glow effect
        ctx.shadowColor = 'rgba(255, 0, 0, 0.5)';
        ctx.shadowBlur = 10;
        
        // Main shape
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        
        // Border
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        
        // Reset shadow
        ctx.shadowBlur = 0;
    });

    // Draw score with hacker font
    ctx.fillStyle = '#00ff9d';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.shadowColor = 'rgba(0, 255, 157, 0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(`SCORE: ${score}`, 20, 30);
    ctx.shadowBlur = 0;

    if (isGameOver) {
        // Draw game over text with hacker effect
        ctx.fillStyle = '#00ff9d';
        ctx.font = 'bold 40px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 255, 157, 0.5)';
        ctx.shadowBlur = 15;
        ctx.fillText('GAME OVER', canvas.width/2, canvas.height/2);
        ctx.font = 'bold 20px "Courier New", monospace';
        ctx.fillText('PRESS SPACE TO RESTART', canvas.width/2, canvas.height/2 + 40);
        ctx.textAlign = 'left';
        ctx.shadowBlur = 0;
    }
}

function gameLoop(currentTime) {
    if (!isGameOver && !isGamePaused) {
        // Calculate time since last frame
        if (!lastFrameTime) lastFrameTime = currentTime;
        const deltaTime = currentTime - lastFrameTime;

        // Only update if enough time has passed (1/60th of a second)
        if (deltaTime >= FRAME_TIME) {
            updatePlayer();
            updateObstacles();
            checkCollisions();
            updateScore();
            draw();
            
            // Update last frame time, accounting for any excess time
            lastFrameTime = currentTime - (deltaTime % FRAME_TIME);
        }
        
        gameLoopId = requestAnimationFrame(gameLoop);
    }
}

function gameOver() {
    isGameOver = true;
    draw();
}

function restartGame() {
    // Reset game state
    if (!player) {
        player = {
            x: 50,
            y: GROUND_HEIGHT,
            width: 40,
            height: 40,
            velocityY: 0,
            isJumping: false
        };
    } else {
        player.y = GROUND_HEIGHT;
        player.velocityY = 0;
    }
    obstacles = [];
    score = 0;
    isGameOver = false;
    gridOffset = 0; // Reset grid position
    
    // Cancel existing game loop if any
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
    }
    
    // Start game loop
    gameLoop();
}

// Make functions globally available for the API modifications
window.restartGame = restartGame;
window.gameLoop = gameLoop;
window.initGame = initGame;
window.gameKeydownHandler = gameKeydownHandler;

// Initialize the game
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
} 