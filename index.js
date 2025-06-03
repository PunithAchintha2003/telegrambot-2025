// index.js
require('dotenv').config(); // Load environment variables from .env file
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('./models/User'); // Adjust path to your User model
const { registerAdminCommands } = require('./commands/adminCommands');
const { registerUserCommands } = require('./commands/userCommands');
const expressApp = require('./app'); // Imports the Express app instance

// --- Configuration and Initialization ---

// Validate essential environment variables
const requiredEnvVars = ['BOT_TOKEN', 'MONGO_URI', 'CHANNEL_USERNAME', 'BOT_USERNAME', 'ADMIN_IDS'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`❌ Critical environment variables missing: ${missingEnvVars.join(', ')}. Please check your .env file.`);
  process.exit(1); // Exit if essential variables are not set
}

// Admin IDs should be an array of numbers
let adminIds = [];
try {
    adminIds = process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (adminIds.length === 0) {
        console.warn("⚠️ ADMIN_IDS found in .env, but none are valid numbers. Admin commands might not work as expected.");
    }
} catch (e) {
    console.error("⚠️ Error parsing ADMIN_IDS. Ensure it's a comma-separated list of numbers.", e);
    process.exit(1);
}


const TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGO_URI;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME; // For verification channel
const BOT_USERNAME = process.env.BOT_USERNAME; // For generating referral links

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(TOKEN, {
    polling: {
        interval: 300, // Fetch updates every 300ms
        autoStart: true,
        params: {
            timeout: 10 // Timeout in seconds for long polling.
        }
    }
});

// --- MongoDB Connection ---
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected successfully.'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1); // Exit if DB connection fails
  });

mongoose.connection.on('error', err => {
  console.error('MongoDB runtime error:', err.message);
});
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected.');
});


// --- Keyboard Definitions ---

// Keyboard for regular users - Updated for USDT
const userKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: '💰 My Balance' }, { text: '👑 Buy VIP' }],
            [{ text: '🔗 My Referrals' }, { text: '💳 Withdraw Funds' }],
            [{ text: '💰 Add Wallet Address' }, { text: '❓ Support' }] // Changed "Add Bank Details"
        ],
        resize_keyboard: true,
        one_time_keyboard: false // Keep keyboard visible
    }
};

// Keyboard for admins
const adminKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: '/admin' }], // Shows admin command list
            [{ text: '/listslips' }, { text: '/pendingupgrades' }],
            [{ text: '/withdrawals' }, { text: '/userstats' }],
            // [{ text: '/finduser <ID or Username>' }] // This is a command with args, better typed
        ],
        resize_keyboard: true
    }
};

// Helper function to check if a user is an admin (passed to command modules)
function isAdmin(userId) {
    return adminIds.includes(parseInt(userId, 10));
}


// --- Register Bot Commands ---
// Pass the bot instance, configurations, isAdmin helper, and keyboards to command handlers
registerAdminCommands(bot, adminIds, adminKeyboard);
// MODIFIED LINE: Pass adminIds to registerUserCommands
registerUserCommands(bot, CHANNEL_USERNAME, isAdmin, userKeyboard, adminIds);


// --- Simplified /start command handler in index.js ---
// The main logic for /start (registration, welcoming) is now primarily in userCommands.js's handleStartCommand.
// This ensures that when a user types /start or clicks a /start deep link, it's handled consistently.
// This listener here primarily ensures the correct keyboard (admin/user) is shown if a user *only* types /start
// without parameters and is already known.
bot.onText(/\/start$/, async (msg) => { // Regex matches /start exactly, without any following characters
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    try {
        // Check if admin first
        if (isAdmin(telegramId)) {
            await bot.sendMessage(chatId, `👋 Welcome Admin, ${msg.from.first_name}! Use the admin menu.`, adminKeyboard);
            return;
        }
        // For regular users, userCommands.js handleStartCommand will manage the full flow.
        // This can be a simple fallback or ensure the keyboard if userCommands.js doesn't always send one.
        // However, to avoid double messages, it's often best to let userCommands.js handleStartCommand fully.
        // If userCommands.js handleStartCommand is robust, this specific listener might become redundant
        // or could be removed if userCommands.js catches all /start variations.
        // For now, let's assume userCommands.js handles the detailed logic.
        // This is just a safety net for a plain /start from an existing user.
        const user = await User.findOne({ telegramId });
        if (user) {
             // If user exists and userCommands.js didn't send a welcome back for plain /start
             // (e.g. if its /start regex is more specific for referrals)
             // await bot.sendMessage(chatId, `👋 Welcome back, ${user.fullName || msg.from.first_name}!`, userKeyboard);
        } else {
            // New user typing plain /start. userCommands.js should handle this.
            // If not, this would be the place:
            // await bot.sendMessage(chatId, `🎉 Welcome! Please follow the prompts to get started.`, userKeyboard);
        }
    } catch (error) {
        console.error('Error in basic /start handler (index.js):', error);
        // Avoid sending a generic error if userCommands.js is meant to handle it.
    }
});


// --- Global Error Handling for Bot ---
bot.on('polling_error', (error) => {
  console.error(`Polling error: ${error.code} - ${error.message}.`);
  // Consider more specific handling, e.g., for ECONNRESET or ETIMEDOUT
});

bot.on('webhook_error', (error) => { // If you ever switch to webhooks
  console.error(`Webhook error: ${error.code} - ${error.message}.`);
});

bot.on('error', (error) => { // General unhandled errors from the bot library
  console.error('General bot library error:', error.message);
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Application specific logging, cleanup, and forcing exit
  process.exit(1); // It's often recommended to restart the process on uncaught exceptions
});


// --- Express Server Setup (for API if needed, e.g., health checks) ---
const PORT = process.env.PORT || 3000;
expressApp.listen(PORT, () => {
  console.log(`🌐 Express API server (for health checks, etc.) running on port ${PORT}`);
});

console.log(`🚀 Telegram bot "${BOT_USERNAME}" started successfully...`);

// Simple health check endpoint for the Express app
expressApp.get('/status', (req, res) => {
    res.status(200).json({
        bot_status: 'running', // Simplified, actual bot health needs more checks
        database_status: mongoose.connection.readyState === 1 ? 'connected' : (mongoose.connection.readyState === 2 ? 'connecting' : 'disconnected'),
        server_uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});