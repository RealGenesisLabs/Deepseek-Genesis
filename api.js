// DeepSeek API integration
class DeepSeekAPI {
    constructor() {
        // Use relative path for the API endpoint
        this.API_ENDPOINT = '/api/chat';
    }

    async modifyGameCode(currentCode, userRequest) {
        const maxRetries = 3;
        let attempt = 0;
        
        while (attempt < maxRetries) {
            try {
                console.log('Sending request to API...');
                const requestBody = {
                    model: "google/gemini-2.5-flash-preview",
                    messages: [
                        {
                            role: "system",
                            content: "You are an expert JavaScript game developer. Your task is to modify the provided game code according to the user's request. Return ONLY valid JavaScript code, no explanations or markdown. The code must be complete and runnable."
                        },
                        {
                            role: "user",
                            content: `Here is the current game code:\n\n${currentCode}\n\nRequest: ${userRequest}\n\nProvide ONLY the complete modified JavaScript code.`
                        }
                    ],
                    temperature: 0.0,
                    stream: true
                };

                console.log('Request body:', JSON.stringify(requestBody, null, 2));

                // Track request body size for progress calculation
                const requestSize = JSON.stringify(requestBody).length;

                const response = await fetch(this.API_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                console.log('Response status:', response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
                }

                // Handle streaming response
                const reader = new ReadableStreamDefaultReader(response.body);
                const decoder = new TextDecoder();
                let receivedLength = 0;
                let fullResponse = '';
                
                while(true) {
                    const {done, value} = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        if (line.trim() === 'data: [DONE]') continue;

                        try {
                            // Remove 'data: ' prefix if it exists
                            const jsonStr = line.replace(/^data: /, '');
                            const data = JSON.parse(jsonStr);
                            
                            if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                                const content = data.choices[0].delta.content;
                                fullResponse += content;
                                receivedLength += content.length;
                                
                                // Update progress bar
                                if (window.gameModifier) {
                                    window.gameModifier.updateProgress(receivedLength, requestSize); // Update based on received stream only
                                }
                            }
                        } catch (e) {
                            console.warn('Failed to parse line:', line, e);
                        }
                    }
                }

                // Reset progress bar when done
                if (window.gameModifier) {
                    window.gameModifier.updateProgress(requestSize, requestSize); // Finalize progress at 100%
                    setTimeout(() => window.gameModifier.updateProgress(0, 1), 500); // Reset after a delay
                }

                // Remove markdown code block formatting if present
                let modifiedCode = fullResponse.trim()
                    .replace(/^```javascript\n/, '')
                    .replace(/^```\n/, '')
                    .replace(/```$/, '')
                    .trim();

                console.log('Modified code:', modifiedCode);

                // Basic validation of the returned code
                if (!modifiedCode || modifiedCode.length < 100) {
                    throw new Error('API returned invalid or incomplete code');
                }

                // Try to parse the code to ensure it's valid JavaScript
                try {
                    new Function(modifiedCode);
                } catch (parseError) {
                    console.error('Parse error:', parseError);
                    throw new Error(`API returned invalid JavaScript: ${parseError.message}`);
                }

                return modifiedCode;
            } catch (error) {
                attempt++;
                console.warn(`API request attempt ${attempt} failed:`, error);
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }
}

// Handle game modifications
class GameModifier {
    constructor() {
        this.api = new DeepSeekAPI();
        this.codeHistory = []; // Use an array for history
        this.setupEventListeners();
        this.progressBar = document.getElementById('progress-bar');
        this.undoButton = document.getElementById('undo-changes'); // Keep a reference
    }

    setupEventListeners() {
        const applyButton = document.getElementById('apply-changes');
        const codeInput = document.getElementById('code-input');
        const restartButton = document.getElementById('restart-button');

        if (this.undoButton) {
            this.undoButton.disabled = true; // Initially disabled
        }

        // Add restart button functionality
        if (restartButton) {
            restartButton.addEventListener('click', async () => {
                const gameFrame = document.getElementById('game-frame');
                if (gameFrame && gameFrame.contentWindow) {
                    try {
                        const overlay = document.querySelector('.game-overlay');
                        if (overlay) overlay.classList.add('active');
                        
                        const handleRestartLoad = () => {
                            if (overlay) overlay.classList.remove('active');
                            gameFrame.removeEventListener('load', handleRestartLoad);
                        };
                        gameFrame.addEventListener('load', handleRestartLoad);

                        // Clear history and disable undo on restart
                        this.codeHistory = [];
                        if (this.undoButton) {
                            this.undoButton.disabled = true;
                        }

                        gameFrame.contentWindow.location.reload();
                    } catch (error) {
                        console.error('Error restarting game by reloading iframe:', error);
                        if (typeof showError === 'function') {
                            showError(`Failed to restart game: ${error.message}`);
                        }
                        const overlay = document.querySelector('.game-overlay');
                        if (overlay) overlay.classList.remove('active');
                    }
                } else {
                    console.error('Restart button clicked, but game-frame or contentWindow not found.');
                    if (typeof showError === 'function') {
                        showError('Failed to restart game: Game frame not found.');
                    }
                }
            });
        }

        // Add event listeners for preset buttons
        document.querySelectorAll('.preset-button').forEach(button => {
            button.addEventListener('click', () => {
                // Get the text content of the button
                const modification = button.textContent.trim();
                // Set the input value and focus it
                codeInput.value = modification;
                codeInput.focus();
            });
        });

        applyButton.addEventListener('click', async () => {
            const userRequest = codeInput.value.trim();
            if (!userRequest) return;

            try {
                if (typeof hideError === 'function') hideError();
                applyButton.disabled = true;
                applyButton.textContent = 'Modifying...';
                applyButton.classList.add('loading');
                const overlay = document.querySelector('.game-overlay');
                if (overlay) overlay.classList.add('active');

                const currentCode = await this.getCurrentGameCode(); // Get raw, unwrapped code
                this.codeHistory.push(currentCode); // Add current state to history
                
                if (this.undoButton) this.undoButton.disabled = false; // Enable undo

                const newCodeFromAI = await this.api.modifyGameCode(currentCode, userRequest);
                await this.replaceGameCode(newCodeFromAI);

                applyButton.textContent = 'Apply Changes';
                applyButton.disabled = false;
                applyButton.classList.remove('loading');
                // Overlay is removed by replaceGameCode on success

            } catch (error) {
                console.error('Failed to modify game:', error);
                if (typeof showError === 'function') showError(`Failed to modify game: ${error.message}`);
                applyButton.textContent = 'Apply Changes';
                applyButton.disabled = false;
                applyButton.classList.remove('loading');
                const overlay = document.querySelector('.game-overlay'); // Ensure overlay is removed on error
                if (overlay) overlay.classList.remove('active');
                
                // If API or replacement fails, pop the state we optimistically pushed
                if (this.codeHistory.length > 0) {
                    this.codeHistory.pop(); 
                    if (this.undoButton && this.codeHistory.length === 0) {
                        this.undoButton.disabled = true;
                    }
                }
            }
        });

        if (this.undoButton) {
            this.undoButton.addEventListener('click', async () => {
                if (this.codeHistory.length === 0) return;

                try {
                    this.undoButton.disabled = true; // Disable during undo
                    this.undoButton.textContent = 'Undoing...';
                    const overlay = document.querySelector('.game-overlay');
                    if (overlay) overlay.classList.add('active');

                    const codeToRestore = this.codeHistory.pop(); // Get raw code
                    await this.replaceGameCode(codeToRestore);

                    this.undoButton.textContent = 'Undo Changes';
                    // Re-enable only if history still has items
                    this.undoButton.disabled = (this.codeHistory.length === 0); 
                    // Overlay removed by replaceGameCode

                } catch (error) {
                    console.error('Failed to undo changes:', error);
                    if (typeof showError === 'function') showError(`Failed to undo changes: ${error.message}`);
                    this.undoButton.textContent = 'Undo Changes';
                    // If undo fails, we might have popped. Re-check history.
                    // Or, consider re-pushing if replaceGameCode failed. For now, just enable if history is not empty.
                    this.undoButton.disabled = (this.codeHistory.length === 0); 
                    const overlay = document.querySelector('.game-overlay');
                    if (overlay) overlay.classList.remove('active');
                }
            });
        }

        // Prevent spacebar scrolling except in text inputs
        window.onkeydown = function(e) {
            if (e.key === ' ' && e.target !== document.body && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
            }
        };
    }

    updateProgress(received, total) {
        if (!this.progressBar) return;
        const progress = total > 0 ? (received / total) * 100 : 0;
        this.progressBar.style.width = `${progress}%`;
    }

    async getCurrentGameCode() {
        const gameFrame = document.getElementById('game-frame');
        if (gameFrame && gameFrame.contentWindow) {
            const iframeDoc = gameFrame.contentDocument || gameFrame.contentWindow.document;
            const dynamicScript = iframeDoc.getElementById('game-js-dynamic');
            if (dynamicScript && dynamicScript.textContent) {
                const scriptContent = dynamicScript.textContent.trim();
                // IIFE pattern: (function() { ... })(); with optional final semicolon
                const iifePattern = /^\s*\(\s*function\s*\(\s*\)\s*\{([\s\S]*?)\}\s*\)\s*\(\s*\)\s*;?\s*$/;
                const match = scriptContent.match(iifePattern);
                if (match && match[1]) {
                    console.log('Retrieved code from iframe dynamic script.');
                    return match[1].trim(); // Return unwrapped code
                } else {
                    console.warn('Dynamic script in iframe found, but IIFE pattern did not match. Content:', scriptContent);
                    // Fallback or error? For now, let's try to fetch original if stripping fails badly.
                }
            }
        }
        // Fallback: Load original game.js if no dynamic script or IIFE stripping fails
        try {
            console.log('Fetching original game.js as current code (fallback).');
            const response = await fetch('game.js'); // Ensure this path is correct
            if (!response.ok) {
                throw new Error(`Failed to load game.js: ${response.status} ${response.statusText}`);
            }
            const originalCode = await response.text();
            if (!originalCode || originalCode.length < 10) { // Basic check
                throw new Error('Fetched original game.js is empty or too short');
            }
            return originalCode.trim();
        } catch (error) {
            console.error('Error getting game code (fallback to original):', error);
            // In a real crisis, maybe return a known safe empty state or re-throw
            // For now, re-throw to make it visible something is wrong.
            throw new Error(`Failed to get current game code: ${error.message}`);
        }
    }

    async replaceGameCode(newCode) {
        const overlay = document.querySelector('.game-overlay'); // in index.html
        const notificationArea = document.querySelector('.changes-applied-notification'); // in index.html
        const gameFrame = document.getElementById('game-frame'); // iframe in index.html

        return new Promise(async (resolve, reject) => {
            if (!gameFrame) {
                console.error("CRITICAL: game-frame iframe not found!");
                if (overlay) overlay.classList.remove('active');
                return reject(new Error("game-frame iframe not found!"));
            }

            if (overlay) overlay.classList.add('active');

            const onIframeLoad = () => {
                gameFrame.removeEventListener('load', onIframeLoad); // Clean up listener

                try {
                    const iframeDoc = gameFrame.contentDocument || gameFrame.contentWindow?.document;
                    const iframeWindow = gameFrame.contentWindow;

                    if (!iframeDoc || !iframeWindow) {
                        console.error("CRITICAL: Cannot access iframe document or window after reload.");
                        if (overlay) overlay.classList.remove('active');
                        return reject(new Error("Cannot access iframe document or window after reload."));
                    }
                    
                    // Cleanup any previous dynamically injected script in case the reload was too fast or cached
                    const oldDynamicScript = iframeDoc.getElementById('game-js-dynamic');
                    if (oldDynamicScript) {
                        oldDynamicScript.remove();
                    }
                    // And ensure any old game loop ID is cleared from the fresh iframe window context
                    if (iframeWindow.gameLoopId) {
                        iframeWindow.cancelAnimationFrame(iframeWindow.gameLoopId);
                        iframeWindow.gameLoopId = null;
                    }

                    const wrappedCode = `
                        (function() {
                            ${newCode}
                            if (typeof initGame === 'function') {
                                initGame();
                            } else if (typeof window.initGame === 'function') {
                                window.initGame();
                            } else {
                                console.warn("New game code injected, but initGame function not found/called automatically.");
                            }
                        })();
                    `;

                    const script = iframeDoc.createElement('script');
                    script.type = 'text/javascript';
                    script.id = 'game-js-dynamic';
                    script.textContent = wrappedCode;
                    iframeDoc.body.appendChild(script);

                    // UI feedback (on index.html elements)
                    if (overlay) overlay.classList.remove('active');
                    gameFrame.classList.add('success-animation');
                    if (notificationArea) {
                        notificationArea.classList.add('glitch-animation', 'notification-animation');
                    } else {
                        console.warn("Notification area not found for success animation.");
                    }

                    setTimeout(() => {
                        gameFrame.classList.remove('success-animation');
                        if (notificationArea) notificationArea.classList.remove('glitch-animation', 'notification-animation');
                    }, 2500);
                    
                    resolve(); // Resolve the promise once new code is injected and animations triggered

                } catch (e) {
                    console.error('Error injecting new code into iframe after reload:', e);
                    if (overlay) overlay.classList.remove('active');
                    reject(e);
                }
            };

            gameFrame.addEventListener('load', onIframeLoad);
            
            try {
                if (gameFrame.contentWindow) {
                    gameFrame.contentWindow.location.reload();
                } else {
                    // Fallback if contentWindow is not immediately available (should be rare)
                    gameFrame.src = gameFrame.src;
                }
            } catch (reloadError) {
                console.error("Error trying to reload iframe:", reloadError);
                gameFrame.removeEventListener('load', onIframeLoad); // Clean listener on error
                if (overlay) overlay.classList.remove('active');
                reject(reloadError);
            }
        });
    }

    cleanupGameState() {
        try {
            // Stop the game loop
            if (typeof window.gameLoopId !== 'undefined') {
                cancelAnimationFrame(window.gameLoopId);
            }

            // Remove event listeners
            if (typeof window.gameKeydownHandler === 'function') {
                document.removeEventListener('keydown', window.gameKeydownHandler);
            }

            // Remove the old script
            const oldScript = document.querySelector('#game-js');
            if (oldScript) {
                oldScript.remove();
            }

            // First set all functions to undefined
            [
                'gameLoop', 'initGame', 'gameKeydownHandler', 'jump',
                'createObstacle', 'updatePlayer', 'updateObstacles',
                'checkCollisions', 'updateScore', 'draw', 'gameOver',
                'restartGame'
            ].forEach(funcName => {
                try {
                    window[funcName] = undefined;
                } catch (e) {
                    console.warn(`Failed to unset ${funcName}:`, e);
                }
            });

            // Then try to delete variables
            [
                'score', 'isGameOver', 'canvas', 'ctx', 'player',
                'obstacles', 'gameLoopId'
            ].forEach(varName => {
                try {
                    if (varName in window) {
                        delete window[varName];
                    }
                } catch (e) {
                    console.warn(`Failed to delete ${varName}:`, e);
                }
            });

        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

// Initialize the game modifier when the page loads
window.addEventListener('load', () => {
    window.gameModifier = new GameModifier();
}); 
