// commands/userCommands.js

const User = require('../models/User');
const userController = require('../controllers/userController');
const {
    WITHDRAWAL_FEE,
    MIN_WITHDRAWAL_AMOUNT,
    VIP_COST,
    SUPPORT_BOT_USERNAME,
    ADMIN_USDT_TRC20_ADDRESS // Import admin's USDT address
} = require('../constants');

// Using a Map to store user-specific states for multi-step conversations
const userStates = new Map();

// This function registers all user-facing commands and message handlers.
function registerUserCommands(bot, channelIdentifier, isAdminFunction, userKeyboard) {
  // Use the passed userKeyboard for consistency
  const currentMainMenuKeyboard = userKeyboard;
  const isAdmin = isAdminFunction; // Use the passed isAdmin function

  // --- Command Handler Functions ---

  // Handles the /start command, registers new users, welcomes existing ones.
  const handleStartCommand = async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const userTelegramUsername = msg.from.username;
    const userFullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() || userTelegramUsername || telegramId;
    const param = match ? match[1] : null; // For referral codes in start link

    let referredByCode = null;
    if (param && param.startsWith('ref_')) {
      referredByCode = param.substring(4);
    }

    try {
      let user = await User.findOne({ telegramId });

      if (!user) {
        const registrationResult = await userController.registerUser(
            telegramId,
            userTelegramUsername,
            referredByCode // Pass the referral code here
        );

        if (registrationResult.success) {
          user = registrationResult.user;
          let welcomeMessage = `🎉 Welcome, ${userFullName}! Your account has been created.`;
          if (user.referredBy) { // Check if referredBy was successfully set
              const referrer = await User.findOne({ referralCode: user.referredBy });
              if (referrer) {
                welcomeMessage += `\n\nYou were referred by ${referrer.fullName || referrer.username || user.referredBy}.`;
              } else {
                welcomeMessage += `\n\nYou were referred by code: \`${user.referredBy}\`.`;
              }
          }
          await bot.sendMessage(chatId, welcomeMessage, currentMainMenuKeyboard);
          // Optionally, prompt for verification immediately
          await bot.sendMessage(chatId, `Please join our channel t.me/${channelIdentifier} and then type /verify to complete your setup.`, { reply_markup: { remove_keyboard: true }});

        } else {
          await bot.sendMessage(chatId, `⚠️ Registration failed: ${registrationResult.message}`, currentMainMenuKeyboard);
        }
      } else {
        // Update user's name and username if they've changed in Telegram profile
        let nameUpdated = false;
        if (userFullName && user.fullName !== userFullName) {
            user.fullName = userFullName;
            nameUpdated = true;
        }
        if (userTelegramUsername && user.username !== userTelegramUsername) {
            user.username = userTelegramUsername;
            nameUpdated = true;
        }
        if (nameUpdated) await user.save();

        await bot.sendMessage(chatId, `👋 Welcome back, ${user.fullName || user.username}!`, currentMainMenuKeyboard);
      }
    } catch (error) {
      console.error('Error in handleStartCommand:', error);
      await bot.sendMessage(chatId, "⚠️ An error occurred. Please try /start again.", currentMainMenuKeyboard);
    }
  };

  // Handles the /verify command, checks channel membership.
  const handleVerifyCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    if (isAdmin(telegramId)) return; // Admins don't use user /verify

    try {
        const user = await User.findOne({ telegramId });
        if (!user) return bot.sendMessage(chatId, "Please /start the bot first.", currentMainMenuKeyboard);
        if (user.isVerified) return bot.sendMessage(chatId, "✅ You are already verified!", currentMainMenuKeyboard);

        const channelApiId = channelIdentifier.startsWith('-100') ? channelIdentifier : `@${channelIdentifier}`;
        const chatMember = await bot.getChatMember(channelApiId, telegramId);

        if (chatMember && ['member', 'creator', 'administrator'].includes(chatMember.status)) {
            const userFullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
            const updateResult = await userController.verifyUser(telegramId, userFullName, msg.from.username);
            if (updateResult.success) {
            await bot.sendMessage(chatId, "🎉 You have been successfully verified! You can now access all features.", currentMainMenuKeyboard);
            } else {
            await bot.sendMessage(chatId, `⚠️ Verification failed: ${updateResult.message}`, currentMainMenuKeyboard);
            }
        } else {
            await bot.sendMessage(chatId,
            `❌ You must join our channel to use this bot: t.me/${channelIdentifier}\n\nAfter joining, click /verify again.`,
            currentMainMenuKeyboard
            );
        }
    } catch (error) {
        console.error('Error during verification:', error);
        if (error.response && error.response.body && error.response.body.description === 'Bad Request: user not found') {
            await bot.sendMessage(chatId, "It seems you haven't started a chat with me or you are not a member of the channel. Please ensure you've started the bot and joined the channel, then try /verify again.", currentMainMenuKeyboard);
        } else {
            await bot.sendMessage(chatId, "⚠️ An error occurred during verification. Please try again later or contact support.", currentMainMenuKeyboard);
        }
    }
  };

  // Handles /mybalance command or "💰 My Balance" button.
  const handleMyBalanceCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    if (isAdmin(telegramId)) return; // Admins use /userstats

    try {
      const result = await userController.getUserDetails(telegramId);
      if (result.success) {
        const user = result.user;
        let message = `**💰 Your Balance:** USDT ${user.balance.toFixed(2)}\n\n`;
        message += `**⭐️ VIP Level:** ${user.vipLevel}\n`;
        message += `**💸 Total Commission Earned:** USDT ${user.commissionEarned.toFixed(2)}\n\n`;

        if (user.upgradeHistory && user.upgradeHistory.length > 0) {
            message += `**⬆️ Recent Upgrades:**\n`;
            user.upgradeHistory.slice(-3).reverse().forEach(upgrade => { // Show latest 3
                message += `  - VIP ${upgrade.level} (USDT ${upgrade.cost.toFixed(2)}) on ${new Date(upgrade.approvedAt).toLocaleDateString()}\n`;
            });
        } else {
            message += `**⬆️ Recent Upgrades:** None\n`;
        }

        if (user.withdrawals && user.withdrawals.length > 0) {
            message += `\n**💳 Recent Withdrawals (USDT):**\n`;
            user.withdrawals.slice(-3).reverse().forEach(withdrawal => { // Show latest 3
                const statusEmoji = withdrawal.status === 'approved' ? '✅' : (withdrawal.status === 'pending' ? '⏳' : '❌');
                message += `  - ${withdrawal.amount.toFixed(2)} (${statusEmoji} ${withdrawal.status}) on ${new Date(withdrawal.requestedAt).toLocaleDateString()}\n`;
            });
        } else {
            message += `\n**💳 Recent Withdrawals:** None\n`;
        }
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...currentMainMenuKeyboard });
      } else {
        await bot.sendMessage(chatId, `❌ Error fetching details: ${result.message}`, currentMainMenuKeyboard);
      }
    } catch (error) {
      console.error("Error in /mybalance command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred.", currentMainMenuKeyboard);
    }
  };

  // Handles /buyvip command or "👑 Buy VIP" button.
  const handleBuyGoldCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    if (isAdmin(telegramId)) return;

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", currentMainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first to purchase VIP.", currentMainMenuKeyboard);

      const nextVIPLevel = user.vipLevel + 1;
      const maxVipLevel = Object.keys(VIP_COST).length;

      if (nextVIPLevel > maxVipLevel) {
        return bot.sendMessage(chatId, "🎉 Congratulations! You have reached the highest VIP Level!", currentMainMenuKeyboard);
      }

      const cost = VIP_COST[nextVIPLevel];
      if (typeof cost === 'undefined') {
        return bot.sendMessage(chatId, "⚠️ VIP Level cost configuration error. Please contact support.", currentMainMenuKeyboard);
      }

      let message = `👑 Acquire VIP Level ${nextVIPLevel}!\n` +
                    `You are currently VIP Level ${user.vipLevel}.\n` +
                    `Buy VIP Level ${nextVIPLevel}: USDT ${cost.toFixed(2)}.\n\n` +
                    `How would you like to proceed?`;

      const keyboardOptions = [
        // Option to pay with USDT TRC20
        [{ text: `🪙 Pay USDT ${cost.toFixed(2)} (USDT TRC20)`, callback_data: `show_usdt_payment_${nextVIPLevel}` }]
      ];

      // Option to upgrade using account balance
      if (user.vipLevel >= 0 && user.balance >= cost) { // Allow VIP 0 to upgrade if they have balance from other means (e.g. admin credit)
        keyboardOptions.push([{ text: `💳 Upgrade using My Balance (USDT ${user.balance.toFixed(2)})`, callback_data: `buy_from_balance_${nextVIPLevel}` }]);
      }

      await bot.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: keyboardOptions
        }
      });

    } catch (error) {
      console.error("Error in /buyvip command:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred. Please try again.", currentMainMenuKeyboard);
    }
  };

  // Handles /withdraw command or "💳 Withdraw Funds" button.
  const handleWithdrawCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    if (isAdmin(telegramId)) return;

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", currentMainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first to withdraw.", currentMainMenuKeyboard);

      if (user.vipLevel === 0) {
          return bot.sendMessage(chatId, "🚫 You must be at least VIP Level 1 to use the withdrawal feature.", currentMainMenuKeyboard);
      }

      if (!user.paymentDetails || !user.paymentDetails.usdtWalletAddress) {
        await bot.sendMessage(chatId, `⚠️ You need to add your USDT (TRC20) wallet address before requesting a withdrawal.\nUse the "💰 Add Wallet Address" button or type /addpaymentdetails.`, currentMainMenuKeyboard);
        return;
      }

      const minTotalWithdrawal = MIN_WITHDRAWAL_AMOUNT + WITHDRAWAL_FEE;
      if (user.balance < minTotalWithdrawal) {
        return bot.sendMessage(chatId, `Your current balance is USDT ${user.balance.toFixed(2)}.\nMinimum withdrawal is USDT ${MIN_WITHDRAWAL_AMOUNT} + USDT ${WITHDRAWAL_FEE} fee = USDT ${minTotalWithdrawal.toFixed(2)}.\nYou do not have sufficient funds.`, currentMainMenuKeyboard);
      }

      userStates.set(telegramId, { command: 'withdraw', step: 'ask_amount' });
      await bot.sendMessage(chatId, `💸 Enter withdrawal amount in USDT.\nMinimum: USDT ${MIN_WITHDRAWAL_AMOUNT}\nFee: USDT ${WITHDRAWAL_FEE}\nYour balance: USDT ${user.balance.toFixed(2)}\n\nYour USDT (TRC20) address for withdrawal: \`${user.paymentDetails.usdtWalletAddress}\``,
      { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });

    } catch (error) {
      console.error("Error in /withdraw command:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred. Please try again.", currentMainMenuKeyboard);
    }
  };

  // Handles /referrals command or "🔗 My Referrals" button.
  const handleReferralsCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    if (isAdmin(telegramId)) return;

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", currentMainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first.", currentMainMenuKeyboard);

      const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=ref_${user.referralCode}`;
      // Find users who were referred by this user's referralCode
      const referredUsers = await User.find({ referredBy: user.referralCode });

      let message = `🔗 Your Unique Referral Link: \n\n\`${referralLink}\`\n\n_(Share this link to invite others!)_\n_(Tap Link to copy)_\n\n`;
      message += `💰 Your Referral Code: \`${user.referralCode}\`\n\n`;


      if (referredUsers.length === 0) {
        message += "👥 You haven't referred any users yet. Keep sharing your link!";
      } else {
        message += `🏆 You have referred ${referredUsers.length} user(s):\n`;
        referredUsers.sort((a, b) => (b.vipLevel - a.vipLevel) || (a.fullName || a.username || '').localeCompare(b.fullName || b.username || '')).forEach((refUser, index) => {
          message += `${index + 1}. ${refUser.fullName || refUser.username || `User ${refUser.telegramId.slice(-4)}`} (VIP: ${refUser.vipLevel}, Verified: ${refUser.isVerified ? '✅' : '❌'})\n`;
        });
      }
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...currentMainMenuKeyboard, disable_web_page_preview: true });

    } catch (error) {
      console.error("Error fetching referral data:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred fetching referral data.", currentMainMenuKeyboard);
    }
  };

  // Handles /addpaymentdetails command or "💰 Add Wallet Address" button.
  const handleAddWalletAddressCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    if (isAdmin(telegramId)) return;

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", currentMainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first.", currentMainMenuKeyboard);

      const currentAddress = user.paymentDetails?.usdtWalletAddress;
      let promptMessage = "Please enter your USDT (TRC20) Wallet Address for withdrawals:";
      if (currentAddress) {
        promptMessage = `Your current USDT (TRC20) address is: \`${currentAddress}\`\n\nEnter a new address to update it, or type 'cancel' to keep the current one.`;
      }

      userStates.set(telegramId, { command: 'add_wallet_address', step: 'ask_usdt_address' });
      await bot.sendMessage(chatId, promptMessage, { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
    } catch (error) {
      console.error("Error in /addpaymentdetails command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred.", currentMainMenuKeyboard);
    }
  };

  // Handles /support command or "❓ Support" button.
  const handleSupportCommand = async (msg) => {
    const chatId = msg.chat.id;
    if (isAdmin(msg.from.id.toString())) return; // Admins don't use user support this way

    await bot.sendMessage(chatId, "If you need help, please contact our support team:", {
        ...currentMainMenuKeyboard, // Keep main keyboard for users
        reply_markup: { // Override with inline for this specific message
          inline_keyboard: [
            [{ text: "📞 Contact Support Team", url: `https://t.me/${SUPPORT_BOT_USERNAME}` }]
          ]
        }
      });
  };


  // --- Register Command Listeners ---
  bot.onText(/\/start(?: (.+))?/, handleStartCommand);
  bot.onText(/\/verify/, handleVerifyCommand);
  bot.onText(/\/mybalance|💰 My Balance/, handleMyBalanceCommand);
  bot.onText(/\/buygold|👑 Buy VIP/, handleBuyGoldCommand);
  bot.onText(/\/withdraw|💳 Withdraw Funds/, handleWithdrawCommand);
  bot.onText(/\/referrals|🔗 My Referrals/, handleReferralsCommand);
  bot.onText(/\/addpaymentdetails|💰 Add Wallet Address/, handleAddWalletAddressCommand); // Updated text
  bot.onText(/❓ Support/, handleSupportCommand);


  // --- General message handler for multi-step conversations and new user fallback ---
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const messageText = msg.text ? msg.text.trim() : ''; // Trim whitespace

    // Ignore messages that are commands, known button texts, or from admins for this general handler
    const knownUserCommandsAndButtons = [
        '/start', '/verify', '/mybalance', '/buygold', '/withdraw', '/referrals', '/addpaymentdetails',
        '💰 My Balance', '👑 Buy VIP', '🔗 My Referrals', '💳 Withdraw Funds', '💰 Add Wallet Address', '❓ Support'
    ];
    if (messageText.startsWith('/') || knownUserCommandsAndButtons.includes(messageText) || isAdmin(telegramId)) {
        return; // Let specific handlers or admin commands take over
    }

    const state = userStates.get(telegramId);

    if (state) {
        switch (state.command) {
            case 'withdraw':
                if (state.step === 'ask_amount') {
                  const amount = parseFloat(messageText);
                  if (isNaN(amount) || amount <= 0) {
                    await bot.sendMessage(chatId, "Invalid amount. Please enter a positive number for USDT amount.");
                    return; // Keep state for re-entry
                  }
                  const user = await User.findOne({ telegramId }); // Re-fetch user for fresh balance
                  if (!user) { userStates.delete(telegramId); return bot.sendMessage(chatId, "Session error. Please try /withdraw again.", currentMainMenuKeyboard); }

                  if (amount < MIN_WITHDRAWAL_AMOUNT) {
                    await bot.sendMessage(chatId, `Minimum withdrawal is USDT ${MIN_WITHDRAWAL_AMOUNT}. Please enter a valid amount.`);
                    return; // Keep state
                  }

                  const totalDeduction = amount + WITHDRAWAL_FEE;
                  if (user.balance < totalDeduction) {
                      userStates.delete(telegramId); // Clear state as this attempt failed
                      return bot.sendMessage(chatId, `Insufficient balance. You need USDT ${totalDeduction.toFixed(2)}. Your balance: USDT ${user.balance.toFixed(2)}.`, currentMainMenuKeyboard);
                  }

                  userStates.set(telegramId, { ...state, step: 'confirm_withdraw', data: { amount } });
                  await bot.sendMessage(chatId, `You requested to withdraw USDT ${amount.toFixed(2)}.\nFee: USDT ${WITHDRAWAL_FEE}.\nTotal deduction: USDT ${totalDeduction.toFixed(2)}.\nWithdrawal to: \`${user.paymentDetails.usdtWalletAddress}\`\n\nConfirm withdrawal?`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: "✅ Yes, Confirm", callback_data: `confirm_withdraw_${amount}` }],
                        [{ text: "❌ No, Cancel", callback_data: "cancel_withdraw" }]
                      ]
                    }
                  });
                }
                break;

            case 'add_wallet_address':
                if (state.step === 'ask_usdt_address') {
                    if (messageText.toLowerCase() === 'cancel') {
                        userStates.delete(telegramId);
                        await bot.sendMessage(chatId, "Wallet address update cancelled.", currentMainMenuKeyboard);
                        return;
                    }
                    // Basic TRC20 validation
                    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(messageText)) {
                        await bot.sendMessage(chatId, "Invalid USDT (TRC20) wallet address. It should start with 'T' and be 34 characters long. Please try again or type 'cancel'.");
                        return; // Keep state for re-entry
                    }
                    userStates.delete(telegramId); // Clear state after getting valid input
                    const result = await userController.updatePaymentDetails(telegramId, messageText);
                    if (result.success) {
                        await bot.sendMessage(chatId, "✅ Your USDT (TRC20) wallet address has been saved!", currentMainMenuKeyboard);
                    } else {
                        await bot.sendMessage(chatId, `❌ Failed to save address: ${result.message}`, currentMainMenuKeyboard);
                    }
                }
                break;

            case 'upload_payment_proof': // Renamed from upload_payment_slip
                let paymentProofData = '';
                if (msg.photo && msg.photo.length > 0) {
                  paymentProofData = msg.photo[msg.photo.length - 1].file_id; // Get the largest photo
                } else if (messageText && messageText.length > 10 && messageText.length < 100) { // Basic check for TxID like string
                  // Further validation for TxID could be added here (e.g. check for hex characters, length)
                  paymentProofData = messageText;
                } else {
                  await bot.sendMessage(chatId, "That doesn't look like a valid payment proof. Please send a clear Screenshot of your transaction.");
                  return; // Keep state
                }

                if (messageText.toLowerCase() === 'cancel') {
                    userStates.delete(telegramId);
                    await bot.sendMessage(chatId, "VIP Purchase cancelled.", currentMainMenuKeyboard);
                    return;
                }

                userStates.delete(telegramId); // Clear state
                const requestedGoldLevel = state.data.level;
                const result = await userController.goldPurchaseRequest(telegramId, requestedGoldLevel, paymentProofData);
                if (result.success) {
                    await bot.sendMessage(chatId, `✅ Your payment proof for VIP Level ${requestedGoldLevel} has been submitted.\nPlease wait for admin approval (usually within 24 hours). We'll notify you.`, currentMainMenuKeyboard);
                } else {
                    await bot.sendMessage(chatId, `❌ Failed to submit proof: ${result.message}`, currentMainMenuKeyboard);
                }
                break;

            case 'confirm_balance_upgrade':
                const userForBalanceUpgrade = await User.findOne({ telegramId });
                if (!userForBalanceUpgrade) { userStates.delete(telegramId); return bot.sendMessage(chatId, "Session error. Please try again.", currentMainMenuKeyboard); }

                const targetVIPForBalance = state.data.targetVIP;
                const costForBalance = VIP_COST[targetVIPForBalance];

                if (messageText.toLowerCase() === 'yes') {
                    if (userForBalanceUpgrade.balance < costForBalance) { // Re-check balance
                        userStates.delete(telegramId);
                        return bot.sendMessage(chatId, `❌ Your balance (USDT ${userForBalanceUpgrade.balance.toFixed(2)}) is no longer sufficient for VIP Level ${targetVIPForBalance}. Upgrade cancelled.`, currentMainMenuKeyboard);
                    }
                    userStates.delete(telegramId);
                    const upgradeResult = await userController.requestUpgradeFromBalance(telegramId, targetVIPForBalance);
                    if (upgradeResult.success) {
                        await bot.sendMessage(chatId, `✅ VIP Level ${targetVIPForBalance} upgrade request from balance submitted. Awaiting admin approval.`, currentMainMenuKeyboard);
                    } else {
                        await bot.sendMessage(chatId, `❌ Upgrade failed: ${upgradeResult.message}`, currentMainMenuKeyboard);
                    }
                } else if (messageText.toLowerCase() === 'no') {
                    userStates.delete(telegramId);
                    await bot.sendMessage(chatId, "❌ Upgrade from balance cancelled.", currentMainMenuKeyboard);
                } else {
                    await bot.sendMessage(chatId, "Invalid response. Please reply 'yes' to confirm or 'no' to cancel the upgrade.");
                }
                break;

            default: // Should not happen if states are managed well
                userStates.delete(telegramId);
                await bot.sendMessage(chatId, "I'm not sure what to do with that. Please use a menu button or a command.", currentMainMenuKeyboard);
                break;
        }
        return; // Message processed by state machine
    }

    // Fallback for messages not handled by commands or states
    const user = await User.findOne({ telegramId });
    if (!user) {
      await bot.sendMessage(chatId, "👋 Welcome! To begin, please click /start.", {
          reply_markup: { inline_keyboard: [[{ text: "🚀 Start Bot", callback_data: "trigger_start_command" }]] }
      });
    } else if (!user.isVerified) {
      await bot.sendMessage(chatId, `🔐 Please verify your account by joining our channel (t.me/${channelIdentifier}) and then typing /verify.`, currentMainMenuKeyboard);
    } else {
      // For verified users sending unrecognized text
      await bot.sendMessage(chatId, "Sorry, I didn't understand that. Please use the menu buttons or available commands.", currentMainMenuKeyboard);
    }
  });


  // --- Handle inline keyboard callbacks for user actions ---
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id.toString();
    const data = callbackQuery.data;

    // Answer callback query immediately to remove "loading" state on button
    await bot.answerCallbackQuery(callbackQuery.id);

    if (isAdmin(telegramId)) { // Admins shouldn't trigger user callbacks
      // await bot.answerCallbackQuery(callbackQuery.id, { text: "Admin action handled separately." });
      return;
    }

    try {
      const user = await User.findOne({ telegramId });

      // Handle 'trigger_start_command' for new users clicking inline start
      if (data === 'trigger_start_command') {
        if (!user) { // Only if truly a new user interaction
            // Simulate a /start command call for this user
            const fakeMsg = { ...callbackQuery.message, from: callbackQuery.from, chat: { id: chatId } };
            await handleStartCommand(fakeMsg, null); // Pass null as match
        }
        // Remove the inline keyboard from the message it was attached to
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id }).catch(e => console.log("Error removing inline kbd:", e.message));
        return;
      }


      if (!user || !user.isVerified) {
          await bot.sendMessage(chatId, "Please /start and /verify your account first to use these features.", currentMainMenuKeyboard);
          // Attempt to remove the inline keyboard from the original message
          await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id }).catch(e => console.log("Error removing kbd for unverified user:", e.message));
          return;
      }

      // --- Callback Handlers ---
      if (data.startsWith('show_usdt_payment_')) {
        const level = parseInt(data.split('_')[3]);
        const cost = VIP_COST[level];
        if (typeof cost === 'undefined') {
            await bot.sendMessage(chatId, "Error: Invalid VIP level selected.", currentMainMenuKeyboard);
            return;
        }

        const paymentInstructions = `
🪙 **Payment for VIP Level ${level} ( USDT ${cost.toFixed(2)} )**

Please send the USDT equivalent of **USDT ${cost.toFixed(2)}** to our TRC20 address:\n\n\
\`${ADMIN_USDT_TRC20_ADDRESS}\`
_(Tap address to copy)_

**Important:**
1. Ensure you are sending **USDT on the TRC20 (Tron) network**.
2. After payment, click the button below to submit your proof.

⚠️ Incorrect network transfers may result in permanent loss of funds.
        `;
        // Edit the original message to show payment details and new button
        await bot.editMessageText(paymentInstructions, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: "🧾 I've Paid, Submit Proof", callback_data: `submit_proof_for_gold_${level}` }]
            ]
          }
        });
      }

      else if (data.startsWith('submit_proof_for_gold_')) {
        const level = parseInt(data.split('_')[4]); // Adjusted index based on 'submit_proof_for_gold_'
        userStates.set(telegramId, { command: 'upload_payment_proof', step: 'waiting_for_proof', data: { level } });
        await bot.sendMessage(chatId, `Please send your payment proof for VIP Level ${level}.\nSend a Screenshot of the completed transaction.`, { reply_markup: { remove_keyboard: true } });
        // Remove the inline keyboard from the "Our USDT Address is..." message
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id }).catch(e => console.log("Error removing kbd for proof submission:", e.message));
      }

      else if (data.startsWith('confirm_withdraw_')) {
        const amount = parseFloat(data.split('_')[2]);
        if (isNaN(amount)) {
            await bot.sendMessage(chatId, "Error processing withdrawal amount.", currentMainMenuKeyboard);
            return;
        }
        userStates.delete(telegramId); // Clear state

        const result = await userController.requestWithdrawal(telegramId, amount);
        if (result.success) {
          await bot.sendMessage(chatId, `✅ Withdrawal request for USDT ${amount.toFixed(2)} submitted successfully! It will be processed by an admin. You will be notified.`, currentMainMenuKeyboard);
        } else {
          await bot.sendMessage(chatId, `❌ Withdrawal failed: ${result.message}`, currentMainMenuKeyboard);
        }
        // Remove the confirmation inline keyboard
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id }).catch(e => console.log("Error removing kbd post withdrawal confirm:", e.message));
      }

      else if (data === 'cancel_withdraw') {
        userStates.delete(telegramId); // Clear any pending withdrawal state
        await bot.sendMessage(chatId, "❌ Withdrawal request cancelled.", currentMainMenuKeyboard);
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id }).catch(e => console.log("Error removing kbd post withdrawal cancel:", e.message));
      }

      else if (data.startsWith('buy_from_balance_')) {
        const targetVIP = parseInt(data.split('_')[3]);
        const cost = VIP_COST[targetVIP];

        if (typeof cost === 'undefined') {
            await bot.sendMessage(chatId, "Error: Invalid VIP level for balance upgrade.", currentMainMenuKeyboard);
            return;
        }
        if (user.balance < cost) {
            await bot.sendMessage(chatId, `❌ You do not have enough balance (USDT ${user.balance.toFixed(2)}) to upgrade to VIP Level ${targetVIP} (Cost: USDT ${cost.toFixed(2)}).`);
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id }).catch(e => console.log("Error removing kbd insufficient balance:", e.message));
            return;
        }

        userStates.set(telegramId, { command: 'confirm_balance_upgrade', step: 'ask_confirmation', data: { targetVIP } });
        await bot.sendMessage(chatId, `Are you sure you want to upgrade to VIP Level ${targetVIP} for USDT ${cost.toFixed(2)} using your account balance?\nType 'yes' to confirm or 'no' to cancel.`, { reply_markup: { remove_keyboard: true } });
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id }).catch(e => console.log("Error removing kbd for balance upgrade confirm:", e.message));
      }

    } catch (error) {
      console.error("Error in user callback_query handler:", error);
      await bot.sendMessage(chatId, "⚠️ An unexpected error occurred. Please try again or contact support.", currentMainMenuKeyboard);
    }
  });

  // --- Fallback for unknown commands from non-admins ---
  bot.onText(/^\/(?!start|verify|mybalance|buygold|withdraw|referrals|addpaymentdetails|admin|listslips|withdrawals|pendingupgrades|userstats).+/, async (msg) => {
      const chatId = msg.chat.id;
      const telegramId = msg.from.id.toString();

      if (isAdmin(telegramId)) return; // Admins might use other commands

      const user = await User.findOne({ telegramId });
      if (!user) {
          await bot.sendMessage(chatId, "👋 Welcome! Please use the /start command to begin.", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 Start Bot", callback_data: "trigger_start_command" }]] }
          });
      } else {
          await bot.sendMessage(chatId, "🤖 Sorry, that's not a recognized command. Please use the menu buttons or type /start to see available options.", currentMainMenuKeyboard);
      }
  });
}

module.exports = { registerUserCommands };
