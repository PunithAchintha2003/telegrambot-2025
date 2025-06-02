// commands/adminCommands.js

const User = require('../models/User');
const userController = require('../controllers/userController'); // Assuming userController handles admin actions too
const { VIP_COST } = require('../constants');

// This function registers all admin-specific commands and callback handlers.
function registerAdminCommands(bot, adminUserIds, adminMainMenuKeyboard) {
  const adminIds = adminUserIds; // Use the passed admin IDs
  const adminKeyboard = adminMainMenuKeyboard; // Use the passed admin keyboard

  // Helper function to check if a user is an admin
  function isAdmin(userId) {
    return adminIds.includes(parseInt(userId, 10)); // Ensure userId is number for comparison
  }

  // Helper function to escape MarkdownV2 special characters for safe display
  const escapeMarkdown = (text) => {
    if (typeof text !== 'string') return String(text); // Convert non-string to string
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
  };

  // --- Admin Help Command ---
  bot.onText(/\/admin/, (msg) => {
    if (!isAdmin(msg.from.id)) {
      return bot.sendMessage(msg.chat.id, "❌ You are not authorized for admin commands.", { reply_markup: { remove_keyboard: true } });
    }
    const commands = `
🛠️ **Admin Command Menu** 🛠️
Use the buttons below or type commands:

🔹 **/listslips** - View pending VIP payment proofs.
🔹 **/pendingupgrades** - View VIP upgrade requests from user balances.
🔹 **/withdrawals** - View pending withdrawal requests.
🔹 **/userstats** - View summary of all users.
🔹 **/finduser <ID or Username>** - Get details for a specific user.
    `;
    bot.sendMessage(msg.chat.id, commands, { ...adminKeyboard, parse_mode: 'Markdown' });
  });

  // --- Admin: /listslips Command (View pending VIP payment proofs) ---
  bot.onText(/\/listslips/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return bot.sendMessage(chatId, "❌ Unauthorized.", { reply_markup: { remove_keyboard: true } });

    try {
      const usersWithPendingProofs = await User.find({ 'paymentSlip.status': 'pending', 'requestedGoldLevel': { $ne: null } });
      if (usersWithPendingProofs.length === 0) {
        return bot.sendMessage(chatId, "📭 No pending VIP payment proofs found at this time.", adminKeyboard);
      }

      await bot.sendMessage(chatId, `Found ${usersWithPendingProofs.length} pending payment proof(s):`, adminKeyboard);

      for (const user of usersWithPendingProofs) {
        const uploadedAt = user.paymentSlip?.uploadedAt?.toLocaleString() || 'N/A';
        const proofData = user.paymentSlip?.fileId || 'No proof data'; // This can be file_id or TxID
        const requestedLevel = user.requestedGoldLevel || 'N/A';

        const caption = `📝 **VIP Purchase Proof**
🧑 User: ${escapeMarkdown(user.fullName || user.username || user.telegramId)} (VIP ${user.vipLevel})
MongoDB ID: \`${user._id}\`
🎯 Requested VIP Level: **${requestedLevel}**
🕒 Uploaded At: ${uploadedAt}
---
🧾 Proof Data/TxID: \`${escapeMarkdown(proofData)}\`
---`;

        const inlineKeyboard = {
            inline_keyboard: [[
                { text: `✅ Approve VIP ${requestedLevel}`, callback_data: `approveSlip_${user._id}` },
                { text: `❌ Reject Proof`, callback_data: `rejectSlip_${user._id}` }
            ],[
                { text: "👁️ View User Details", callback_data: `viewUserDetails_${user._id}` }
            ]]
        };

        // If proofData looks like a Telegram file_id, try to send as photo. Otherwise, send as text.
        // A more robust check might be needed if TxIDs can look like file_ids.
        // Common file_ids are long and often contain 'AgAD' or similar patterns.
        if (proofData.length > 50 && (proofData.includes('_') || proofData.includes('-') || proofData.startsWith('Ag'))) {
            try {
                await bot.sendPhoto(chatId, proofData, { caption, parse_mode: 'Markdown', reply_markup: inlineKeyboard });
            } catch (photoError) {
                console.warn(`Failed to send proof as photo (ID: ${proofData}), sending as text. Error: ${photoError.message}`);
                await bot.sendMessage(chatId, caption + "\n\n_(Note: Proof above was text or an invalid file_id for photo display)_", { parse_mode: 'Markdown', reply_markup: inlineKeyboard });
            }
        } else { // Assume it's a TxID or other text proof
            await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: inlineKeyboard });
        }
      }
    } catch (error) {
      console.error("Error fetching pending proofs:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while fetching pending payment proofs.", adminKeyboard);
    }
  });

  // --- Admin: /pendingupgrades Command (View pending balance upgrades) ---
  bot.onText(/\/pendingupgrades/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return bot.sendMessage(chatId, "❌ Unauthorized.", { reply_markup: { remove_keyboard: true } });

    try {
      const usersWithPendingUpgrades = await User.find({ 'upgradeRequest.targetVIP': { $ne: null } });
      if (usersWithPendingUpgrades.length === 0) {
        return bot.sendMessage(chatId, "📭 No pending VIP upgrade requests from balance found.", adminKeyboard);
      }
      await bot.sendMessage(chatId, `Found ${usersWithPendingUpgrades.length} pending balance upgrade(s):`, adminKeyboard);

      for (const user of usersWithPendingUpgrades) {
        const targetVIP = user.upgradeRequest?.targetVIP || 'N/A';
        const requestedAt = user.upgradeRequest?.requestedAt?.toLocaleString() || 'N/A';
        const cost = VIP_COST[targetVIP] || 0;

        const messageText = `⬆️ **VIP Upgrade from Balance**
🧑 User: ${escapeMarkdown(user.fullName || user.username || `ID: ${user.telegramId}`)} (Current VIP ${user.vipLevel})
MongoDB ID: \`${user._id}\`
🎯 Target VIP Level: **${targetVIP}** (Cost: USDT ${cost.toFixed(2)})
💰 User's Current Balance: USDT ${user.balance.toFixed(2)}
🕒 Requested At: ${requestedAt}`;

        await bot.sendMessage(chatId, messageText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: `✅ Approve VIP ${targetVIP}`, callback_data: `approveUpgrade_${user._id}` },
              { text: `❌ Deny Upgrade`, callback_data: `denyUpgrade_${user._id}` }
            ],[
                { text: "👁️ View User Details", callback_data: `viewUserDetails_${user._id}` }
            ]]
          }
        });
      }
    } catch (error) {
      console.error("Error fetching pending upgrades:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while fetching pending upgrade requests.", adminKeyboard);
    }
  });

  // --- Admin: /userstats Command (View summary of all users) ---
  bot.onText(/\/userstats/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return bot.sendMessage(chatId, "❌ Unauthorized.", { reply_markup: { remove_keyboard: true } });

    try {
      const stats = await userController.getAllUserStats(); // Assuming this controller method exists and is updated
      if (!stats.success || stats.users.length === 0) {
        return bot.sendMessage(chatId, "📭 No users found or error fetching stats.", adminKeyboard);
      }

      let summaryMessage = `📊 **User Statistics Summary (${stats.users.length} Users)**\n\n`;
      const BATCH_SIZE = 10; // Users per message
      let userBatchMessage = "";

      for (let i = 0; i < stats.users.length; i++) {
        const user = stats.users[i];
        userBatchMessage += `---
🧑‍💻 **${escapeMarkdown(user.fullName || user.username || `User ID: ${user.telegramId}`)}**
   ⭐ VIP: ${user.vipLevel}
   💰 Balance: USDT ${user.currentBalanceUSDT.toFixed(2)}
   💸 Deposited (VIP): USDT ${user.totalDepositedUSDT.toFixed(2)}
   💳 Withdrawn: USDT ${user.totalApprovedWithdrawalsUSDT.toFixed(2)}
   🎁 Commission: USDT ${user.totalCommissionEarnedUSDT.toFixed(2)}\n`;

        if ((i + 1) % BATCH_SIZE === 0 || i === stats.users.length - 1) {
          await bot.sendMessage(chatId, summaryMessage + userBatchMessage, { parse_mode: 'Markdown' });
          summaryMessage = ""; // Clear for next batch header if any
          userBatchMessage = "";
        }
      }

      const finalSummary = `--- **Overall Totals** ---
Total Deposits (VIP): USDT **${stats.totalDepositsUSDT.toFixed(2)}**
Total Approved Withdrawals: USDT **${stats.totalWithdrawalsUSDT.toFixed(2)}**
Total Commissions Paid: USDT **${stats.totalCommissionsUSDT.toFixed(2)}**`;
      await bot.sendMessage(chatId, finalSummary, { parse_mode: 'Markdown', ...adminKeyboard });

    } catch (error) {
      console.error("Error fetching user stats:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while fetching user statistics.", adminKeyboard);
    }
  });


  // --- Admin: /withdrawals Command (View pending USDT withdrawal requests) ---
  bot.onText(/\/withdrawals/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return bot.sendMessage(chatId, "❌ Unauthorized.", { reply_markup: { remove_keyboard: true } });

    try {
      // Find users who have any withdrawal with status 'pending'
      const usersWithPendingWithdrawals = await User.find({ 'withdrawals.status': 'pending' })
        .select('fullName username telegramId balance paymentDetails withdrawals'); // Ensure all needed fields

      if (usersWithPendingWithdrawals.length === 0) {
        return bot.sendMessage(chatId, "📭 No pending USDT withdrawal requests found.", adminKeyboard);
      }

      let actualPendingCount = 0;
      for (const user of usersWithPendingWithdrawals) {
        const pendingWithdrawals = user.withdrawals.filter(w => w.status === 'pending');
        if (pendingWithdrawals.length === 0) continue;
        actualPendingCount += pendingWithdrawals.length;

        for (const withdrawal of pendingWithdrawals) {
          const usdtWalletAddress = user.paymentDetails?.usdtWalletAddress || 'N/A (Not Set!)';
          const withdrawalAmountUSDT = typeof withdrawal.amount === 'number' ? withdrawal.amount.toFixed(2) : 'N/A';
          const withdrawalFeeUSDT = typeof withdrawal.fee === 'number' ? withdrawal.fee.toFixed(2) : 'N/A';
          const requestedAt = withdrawal.requestedAt?.toLocaleString() || 'N/A';

          // Note: Admin needs to manually calculate USDT to USDT for sending.
          // Bot only shows USDT amounts as per user request.
          const messageText = `💸 **USDT Withdrawal Request (USDT)**
🧑 User: ${escapeMarkdown(user.fullName || user.username || `ID: ${user.telegramId}`)}
MongoDB User ID: \`${user._id}\`
Withdrawal ID: \`${withdrawal._id}\`
---
💰 Amount: USDT **${withdrawalAmountUSDT}**
📉 Fee: USDT ${withdrawalFeeUSDT}
🏦 User's USDT (TRC20) Wallet:
\`${escapeMarkdown(usdtWalletAddress)}\`
_(Tap to copy address)_
---
📊 User's Current Balance: USDT ${user.balance.toFixed(2)}
🕒 Requested At: ${requestedAt}`;

          await bot.sendMessage(chatId, messageText, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ Approve Withdrawal", callback_data: `appW_${user.telegramId}_${withdrawal._id}` }, // Pass telegramId for controller
                  { text: "❌ Reject Withdrawal", callback_data: `rejW_${user.telegramId}_${withdrawal._id}` }
                ],
                [
                  { text: "👁️ View User Details", callback_data: `viewUserDetails_${user._id}` }
                ]
              ]
            }
          });
        }
      }
      if (actualPendingCount === 0) {
         return bot.sendMessage(chatId, "📭 No pending USDT withdrawal requests found after filtering.", adminKeyboard);
      }
      await bot.sendMessage(chatId, `Above are all ${actualPendingCount} pending USDT withdrawal request(s).`, adminKeyboard);
    } catch (error) {
      console.error("Error fetching pending withdrawals:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while fetching withdrawal requests.", adminKeyboard);
    }
  });

  // --- Admin: /finduser <ID or Username> ---
  bot.onText(/\/finduser (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) return bot.sendMessage(chatId, "❌ Unauthorized.", { reply_markup: { remove_keyboard: true } });

    const searchTerm = match[1].trim();
    if (!searchTerm) return bot.sendMessage(chatId, "Please provide a Telegram ID or Username to search.", adminKeyboard);

    try {
        let query = {};
        if (searchTerm.startsWith('@')) {
            query = { username: searchTerm.substring(1) };
        } else if (/^\d+$/.test(searchTerm)) {
            query = { telegramId: searchTerm };
        } else {
            // Try searching by full name (case-insensitive) if it's not an ID or @username
            query = { fullName: { $regex: searchTerm, $options: 'i' } };
        }

        const user = await User.findOne(query);

        if (!user) {
            return bot.sendMessage(chatId, `❌ User not found with identifier: ${escapeMarkdown(searchTerm)}`, { ...adminKeyboard, parse_mode: 'Markdown'});
        }

        // Use the same logic as viewUserDetails callback for consistency
        const userUpgradeHistory = user.upgradeHistory || [];
        const userWithdrawals = user.withdrawals || [];
        const totalDeposited = userUpgradeHistory.reduce((sum, upgrade) => sum + (upgrade.cost || 0), 0);
        const totalApprovedWithdrawals = userWithdrawals.reduce((sum, w) => sum + (w.status === 'approved' && typeof w.amount === 'number' ? w.amount : 0), 0);
        const usdtWallet = user.paymentDetails?.usdtWalletAddress || 'N/A';
        const referredByInfo = user.referredBy ? `\`${escapeMarkdown(user.referredBy)}\`` : 'N/A';

        const message = `👤 **User Details for ${escapeMarkdown(searchTerm)}:**
Telegram ID: \`${escapeMarkdown(user.telegramId.toString())}\`
Username: ${user.username ? `@${escapeMarkdown(user.username)}` : 'N/A'}
Full Name: ${escapeMarkdown(user.fullName || 'N/A')}
Referral Code: \`${escapeMarkdown(user.referralCode)}\`
Referred By Code: ${referredByInfo}
Verified: ${user.isVerified ? '✅ Yes' : '❌ No'}
VIP Level: **${user.vipLevel}**
Balance: USDT ${user.balance.toFixed(2)}
Commission Earned: USDT ${user.commissionEarned.toFixed(2)}
Total Deposited (VIP): USDT ${totalDeposited.toFixed(2)}
Total Approved Withdrawals: USDT ${totalApprovedWithdrawals.toFixed(2)}

**Payment Details:**
USDT (TRC20) Wallet: \`${escapeMarkdown(usdtWallet)}\`

**Recent Activity:**
${user.upgradeHistory.length > 0 ? 'Last Upgrade: VIP ' + user.upgradeHistory.slice(-1)[0].level + ' on ' + new Date(user.upgradeHistory.slice(-1)[0].approvedAt).toLocaleDateString() : 'No upgrade history.'}
${user.withdrawals.length > 0 ? 'Last Withdrawal Req: USDT ' + user.withdrawals.slice(-1)[0].amount.toFixed(2) + ' (' + user.withdrawals.slice(-1)[0].status + ')' : 'No withdrawal history.'}
        `;
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...adminKeyboard });

    } catch (error) {
        console.error("Error in /finduser:", error);
        bot.sendMessage(chatId, "⚠️ An error occurred while searching for the user.", adminKeyboard);
    }
  });


  // --- Handle all admin inline keyboard callbacks ---
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id; // Admin's chat ID
    const data = callbackQuery.data;
    const adminTelegramId = callbackQuery.from.id;

    if (!isAdmin(adminTelegramId)) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: "❌ You are not authorized for this action." });
    }

    // Answer query immediately
    await bot.answerCallbackQuery(callbackQuery.id);

    const matchApproveSlip = data.match(/^approveSlip_(.+)$/);
    const matchRejectSlip = data.match(/^rejectSlip_(.+)$/);
    const matchApproveUpgrade = data.match(/^approveUpgrade_(.+)$/);
    const matchDenyUpgrade = data.match(/^denyUpgrade_(.+)$/);
    // For withdrawals, appW_TELEGRAMID_WITHDRAWALMONGOID
    const matchApproveWithdrawal = data.match(/^appW_(.+?)_(.+)$/);
    const matchRejectWithdrawal = data.match(/^rejW_(.+?)_(.+)$/);
    const matchViewUserDetails = data.match(/^viewUserDetails_(.+)$/); // User's MongoDB _id

    try {
        // --- Slip/Proof Handling ---
        if (matchApproveSlip) {
            const userMongoId = matchApproveSlip[1];
            const result = await userController.adminGoldApprove(userMongoId, true, bot); // Pass bot for notifications
            if (result.success && result.user) {
                await bot.sendMessage(chatId, `✅ VIP purchase approved for ${result.user.fullName || result.user.telegramId}. User is now VIP ${result.user.vipLevel}.`, adminKeyboard);
                if (result.user.telegramId) { // Notify user
                    await bot.sendMessage(result.user.telegramId.toString(), `🎉 Your VIP Level ${result.user.vipLevel} purchase has been approved! Welcome to the club!`);
                }
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id });
            } else {
                await bot.sendMessage(chatId, `❌ Approval failed: ${result.message}`, adminKeyboard);
            }
        } else if (matchRejectSlip) {
            const userMongoId = matchRejectSlip[1];
            const result = await userController.adminGoldApprove(userMongoId, false, bot);
            if (result.success && result.user) {
                await bot.sendMessage(chatId, `❌ VIP purchase proof rejected for ${result.user.fullName || result.user.telegramId}.`, adminKeyboard);
                 if (result.user.telegramId) { // Notify user
                    await bot.sendMessage(result.user.telegramId.toString(), `⚠️ Your recent VIP purchase proof was rejected. Please contact support or try submitting again with valid proof.`);
                }
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id });
            } else {
                await bot.sendMessage(chatId, `❌ Rejection failed: ${result.message}`, adminKeyboard);
            }
        }

        // --- Upgrade from Balance Handling ---
        else if (matchApproveUpgrade) {
            const userMongoId = matchApproveUpgrade[1];
            const result = await userController.adminApproveUpgradeFromBalance(userMongoId, true, bot);
            if (result.success && result.user) {
                await bot.sendMessage(chatId, `✅ VIP upgrade from balance approved for ${result.user.fullName || result.user.telegramId}. User is now VIP ${result.user.vipLevel}.`, adminKeyboard);
                if (result.user.telegramId) {
                    await bot.sendMessage(result.user.telegramId.toString(), `🎉 Your VIP Level ${result.user.vipLevel} upgrade from balance has been approved!`);
                }
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id });
            } else {
                await bot.sendMessage(chatId, `❌ Balance upgrade approval failed: ${result.message}`, adminKeyboard);
            }
        } else if (matchDenyUpgrade) {
            const userMongoId = matchDenyUpgrade[1];
            const result = await userController.adminApproveUpgradeFromBalance(userMongoId, false, bot);
            if (result.success && result.user) {
                await bot.sendMessage(chatId, `❌ VIP upgrade from balance denied for ${result.user.fullName || result.user.telegramId}.`, adminKeyboard);
                if (result.user.telegramId) {
                    await bot.sendMessage(result.user.telegramId.toString(), `⚠️ Your VIP Level upgrade request from balance has been denied. If funds were deducted, they should be restored. Contact support if issues persist.`);
                }
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id });
            } else {
                await bot.sendMessage(chatId, `❌ Balance upgrade denial failed: ${result.message}`, adminKeyboard);
            }
        }

        // --- Withdrawal Handling ---
        else if (matchApproveWithdrawal) {
            const userTelegramIdForWithdrawal = matchApproveWithdrawal[1];
            const withdrawalMongoId = matchApproveWithdrawal[2];
            const result = await userController.adminWithdrawalProcess(userTelegramIdForWithdrawal, withdrawalMongoId, true);
            if (result.success && result.user) {
                const approvedWithdrawal = result.user.withdrawals.id(withdrawalMongoId);
                const amount = approvedWithdrawal ? approvedWithdrawal.amount.toFixed(2) : 'N/A';
                await bot.sendMessage(chatId, `✅ Withdrawal of USDT ${amount} approved for ${result.user.fullName || result.user.telegramId}. Instructed to send USDT.`, adminKeyboard);
                if (result.user.telegramId) {
                    await bot.sendMessage(result.user.telegramId.toString(), `✅ Your withdrawal request of USDT ${amount} has been approved and is being processed! You should receive USDT in your wallet shortly.`);
                }
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id });
            } else {
                await bot.sendMessage(chatId, `❌ Withdrawal approval failed: ${result.message}`, adminKeyboard);
            }
        } else if (matchRejectWithdrawal) {
            const userTelegramIdForWithdrawal = matchRejectWithdrawal[1];
            const withdrawalMongoId = matchRejectWithdrawal[2];
            const result = await userController.adminWithdrawalProcess(userTelegramIdForWithdrawal, withdrawalMongoId, false);
             if (result.success && result.user) {
                const rejectedWithdrawal = result.user.withdrawals.id(withdrawalMongoId);
                const amount = rejectedWithdrawal ? (rejectedWithdrawal.amount + rejectedWithdrawal.fee).toFixed(2) : 'N/A'; // Amount + Fee refunded
                await bot.sendMessage(chatId, `❌ Withdrawal rejected for ${result.user.fullName || result.user.telegramId}. USDT ${amount} (amount + fee) refunded to user balance.`, adminKeyboard);
                if (result.user.telegramId) {
                    await bot.sendMessage(result.user.telegramId.toString(), `❌ Your withdrawal request has been rejected. The amount (USDT ${amount}) has been refunded to your bot balance.`);
                }
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id });
            } else {
                await bot.sendMessage(chatId, `❌ Withdrawal rejection failed: ${result.message}`, adminKeyboard);
            }
        }

        // --- View User Details Handling (from inline button) ---
        else if (matchViewUserDetails) {
            const userMongoId = matchViewUserDetails[1];
            const user = await User.findById(userMongoId);
            if (!user) return bot.sendMessage(chatId, "Error: User not found by ID.", adminKeyboard);

            const userUpgradeHistory = user.upgradeHistory || [];
            const userWithdrawals = user.withdrawals || [];
            const totalDeposited = userUpgradeHistory.reduce((sum, upgrade) => sum + (upgrade.cost || 0), 0);
            const totalApprovedWithdrawals = userWithdrawals.reduce((sum, w) => sum + (w.status === 'approved' && typeof w.amount === 'number' ? w.amount : 0), 0);
            const usdtWallet = user.paymentDetails?.usdtWalletAddress || 'N/A';
            const referredByInfo = user.referredBy ? `\`${escapeMarkdown(user.referredBy)}\`` : 'N/A';


            const message = `👤 **User Details:**
Telegram ID: \`${escapeMarkdown(user.telegramId.toString())}\`
Username: ${user.username ? `@${escapeMarkdown(user.username)}` : 'N/A'}
Full Name: ${escapeMarkdown(user.fullName || 'N/A')}
Referral Code: \`${escapeMarkdown(user.referralCode)}\`
Referred By Code: ${referredByInfo}
Verified: ${user.isVerified ? '✅ Yes' : '❌ No'}
VIP Level: **${user.vipLevel}**
Balance: USDT ${user.balance.toFixed(2)}
Commission Earned: USDT ${user.commissionEarned.toFixed(2)}
Total Deposited (VIP): USDT ${totalDeposited.toFixed(2)}
Total Approved Withdrawals: USDT ${totalApprovedWithdrawals.toFixed(2)}

**Payment Details:**
USDT (TRC20) Wallet: \`${escapeMarkdown(usdtWallet)}\`
            `;
            // Send as a new message, don't edit the original request message
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...adminKeyboard });
        }
    } catch (error) {
        console.error("Error in admin callback_query handler:", error);
        await bot.sendMessage(chatId, "⚠️ An error occurred processing the admin action.", adminKeyboard);
    }
  });
}

module.exports = { registerAdminCommands };
