// app.js
const express = require('express');
const userRoutes = require('./routes/userRoutes'); // Ensure this path is correct

const expressApp = express();

// Middleware to parse JSON request bodies
expressApp.use(express.json());

// Middleware for URL-encoded data
expressApp.use(express.urlencoded({ extended: true }));

// Basic logging middleware (optional, but helpful for debugging API calls)
expressApp.use((req, res, next) => {
    // Avoid logging for static assets if you add them later, e.g. by checking req.path
    if (!req.path.includes('.') || req.path.endsWith('.html')) { // Simple filter
        console.log(`API Request: ${req.method} ${req.originalUrl} at ${new Date().toISOString()}`);
    }
    next();
});

// API routes defined in userRoutes.js will be prefixed with /api
expressApp.use('/api', userRoutes);

// A specific GET handler for the root /api path (e.g., for a welcome message or API version info)
expressApp.get('/api', (req, res) => {
    res.json({ message: "Welcome to the Telegram Bot API backend!", version: "1.0.0" });
});

// Catch-all for /api routes that were not matched by userRoutes or the GET /api above.
// This middleware will execute if a request starts with /api but doesn't match any defined /api/... route.
// IMPORTANT: This should come  all other more specific /api route handlers.
expressApp.use('/api', (req, res, next) => {
    // If we reach here, it means no more specific /api route was found.
    res.status(404).json({ error: "Requested API endpoint not found." });
});

// Global error handler for the Express app.
// This should be the LAST middleware added to the stack.
expressApp.use((err, req, res, next) => {
    console.error("Express App Unhandled Error:", err.stack);
    // If headers have already been sent to the client, delegate to the default Express error handler.
    if (res.headersSent) {
        return next(err);
    }
    res.status(err.status || 500).json({
        error: "Internal Server Error",
        message: err.message || "An unexpected error occurred."
        // In development, you might want to include err.stack, but not in production.
    });
});

// Export the configured Express application instance.
module.exports = expressApp;
