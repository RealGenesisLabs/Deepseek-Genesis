const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for development
app.use(cors());
app.use(express.json());

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    if (!res.headersSent) {
        res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

// Keep the process alive
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Proxy endpoint for OpenRouter API
app.post('/api/chat', async (req, res) => {
    try {
        console.log('Received chat request');
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-flash-preview",
                messages: req.body.messages,
                temperature: 0.0,
                stream: true
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API error:', errorText);
            return res.status(response.status).json({
                error: 'API request failed',
                details: errorText
            });
        }

        // Set headers for streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Create a flag to track if response has ended
        let hasEnded = false;

        // Handle stream end
        const handleEnd = () => {
            if (!hasEnded) {
                hasEnded = true;
                console.log('Stream completed successfully');
                try {
                    res.write('data: [DONE]\n\n');
                    res.end();
                } catch (error) {
                    console.log('Stream already closed');
                }
            }
        };

        // Stream the response
        response.body.on('data', chunk => {
            if (!hasEnded) {
                res.write(chunk);
            }
        });

        // Handle end of stream
        response.body.on('end', handleEnd);

        // Handle errors during streaming
        response.body.on('error', (error) => {
            console.error('Stream error:', error);
            if (!hasEnded) {
                hasEnded = true;
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Stream error',
                        details: error.message
                    });
                } else {
                    res.end();
                }
            }
        });

        // Handle client disconnect
        req.on('close', () => {
            console.log('Client disconnected');
            if (!hasEnded) {
                hasEnded = true;
                response.body.destroy();
            }
        });

    } catch (error) {
        console.error('Proxy error:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to fetch from OpenRouter API',
                details: error.message
            });
        } else {
            res.end();
        }
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
}); 