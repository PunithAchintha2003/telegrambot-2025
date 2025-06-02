// routes/userRoutes.js

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// These routes are for potential external API interactions, not directly used by the bot's internal command flow.

// Public user routes
router.post('/register', async (req, res) => {
    const { telegramId, username, referredByCode } = req.body; // Ensure frontend sends referredByCode
    const result = await userController.registerUser(telegramId, username, referredByCode);
    if (result.success) res.status(201).json(result); // 201 for created
    else res.status(400).json(result); // 400 for bad request (e.g., already registered)
});

router.post('/verify', async (req, res) => {
    const { telegramId, fullName, username } = req.body;
    const result = await userController.verifyUser(telegramId, fullName, username);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

// Endpoint for submitting Gold purchase proof (TxID or reference to uploaded file if API handles uploads)
router.post('/gold-purchase-request', async (req, res) => {
    const { telegramId, requestedGoldLevel, paymentProof } = req.body; // paymentProof can be TxID or file ref
    const result = await userController.goldPurchaseRequest(telegramId, requestedGoldLevel, paymentProof);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

router.post('/request-withdrawal', async (req, res) => { // Renamed for clarity
    // Amount should be in USDT, consistent with userController and bot flow
    const { telegramId, amountUSDT } = req.body;
    const result = await userController.requestWithdrawal(telegramId, amountUSDT);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

// Updated to handle USDT wallet address
router.post('/update-payment-details', async (req, res) => {
    const { telegramId, usdtWalletAddress } = req.body;
    const result = await userController.updatePaymentDetails(telegramId, usdtWalletAddress);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

router.post('/request-upgrade-from-balance', async (req, res) => { // Renamed for clarity
    const { telegramId, targetVIP } = req.body;
    const result = await userController.requestUpgradeFromBalance(telegramId, targetVIP);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

router.get('/user/:telegramId', async (req, res) => {
    const { telegramId } = req.params;
    const result = await userController.getUserDetails(telegramId);
    if (result.success) res.json(result);
    else res.status(404).json(result); // 404 if user not found
});


// Admin routes (example structure - should be protected by admin auth middleware in a real application)
// These are less likely to be used if admin actions are via bot commands, but provided for completeness.

router.post('/admin/gold-approve', async (req, res) => {
    // In a real API, adminId would come from authenticated session/token
    // const { adminId, userMongoId, approve } = req.body;
    // const result = await userController.adminGoldApprove(userMongoId, approve, null); // Pass null for bot if not used
    // if (result.success) res.json(result); else res.status(400).json(result);
    res.status(501).json({ message: "Admin Gold Approval via API is not implemented. Use bot commands." });
});

router.post('/admin/withdrawal-process', async (req, res) => {
    // const { adminId, userTelegramId, withdrawalMongoId, approve } = req.body;
    // const result = await userController.adminWithdrawalProcess(userTelegramId, withdrawalMongoId, approve);
    // if (result.success) res.json(result); else res.status(400).json(result);
     res.status(501).json({ message: "Admin Withdrawal Process via API is not implemented. Use bot commands." });
});

router.post('/admin/approve-upgrade-from-balance', async (req, res) => { // Renamed
    // const { adminId, userMongoId, approve } = req.body;
    // const result = await userController.adminApproveUpgradeFromBalance(userMongoId, approve, null); // Pass null for bot
    // if (result.success) res.json(result); else res.status(400).json(result);
    res.status(501).json({ message: "Admin Upgrade from Balance via API is not implemented. Use bot commands." });
});

router.get('/admin/user-stats', async (req, res) => {
    // const { adminId } = req.body; // Or from auth
    // const result = await userController.getAllUserStats();
    // if (result.success) res.json(result); else res.status(500).json(result);
    res.status(501).json({ message: "Admin User Stats via API is not implemented. Use bot commands." });
});


module.exports = router;
