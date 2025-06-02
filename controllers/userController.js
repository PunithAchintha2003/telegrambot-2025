// controllers/userController.js

const User = require('../models/User');
const crypto = require('crypto');
const { payCommission } = require('../utils/commission'); // Assuming this path is correct
const { VIP_COST, MIN_WITHDRAWAL_AMOUNT, WITHDRAWAL_FEE } = require('../constants');

// Generates a unique referral code
function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Registers a new user
exports.registerUser = async (telegramId, username, referredByCode = null) => {
  try {
    if (!telegramId) return { success: false, message: 'Telegram ID is required' };

    let user = await User.findOne({ telegramId: telegramId.toString() });
    if (user) return { success: false, message: 'User already registered.', user };

    let referralCode = generateReferralCode();
    // Ensure referral code is unique
    while (await User.findOne({ referralCode })) {
      referralCode = generateReferralCode();
    }

    let referrer = null;
    if (referredByCode) {
        referrer = await User.findOne({ referralCode: referredByCode });
        if (!referrer) {
            // Handle invalid referral code, e.g., log it or inform user, but still register
            console.warn(`Invalid referral code used during registration: ${referredByCode}`);
            referredByCode = null; // Clear invalid code
        }
    }


    user = new User({
      telegramId: telegramId.toString(),
      username: username || null,
      referralCode,
      referredBy: referrer ? referrer.referralCode : null, // Store referrer's code
      isVerified: false,
      vipLevel: 0,
      balance: 0,
      commissionEarned: 0,
      paymentDetails: { usdtWalletAddress: null }, // Initialize paymentDetails with USDT field
      upgradeHistory: [],
      withdrawals: [],
      paymentSlip: {},
    });

    await user.save();
    return { success: true, message: 'User registered successfully.', user };
  } catch (err) {
    console.error('Error in registerUser:', err.message);
    return { success: false, message: 'Internal server error during registration.', error: err.message };
  }
};

// Verifies a user
exports.verifyUser = async (telegramId, fullName = null, username = null) => {
  try {
    if (!telegramId) return { success: false, message: 'Telegram ID is required.' };

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found.' };

    user.isVerified = true;
    if (fullName) user.fullName = fullName;
    if (username && user.username !== username) user.username = username; // Update username if changed

    await user.save();
    return { success: true, message: 'User verified successfully.', user };
  } catch (err) {
    console.error('Error in verifyUser:', err.message);
    return { success: false, message: 'Internal server error during verification.', error: err.message };
  }
};

// Handles a user's request to purchase VIP (VIP upgrade) using payment proof
exports.goldPurchaseRequest = async (telegramId, requestedGoldLevel, paymentProof) => {
  try {
    if (!telegramId || !requestedGoldLevel || !paymentProof) {
      return { success: false, message: 'Missing required fields: telegramId, requestedGoldLevel, or paymentProof.' };
    }

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found.' };

    if (requestedGoldLevel !== user.vipLevel + 1) {
      return { success: false, message: `Invalid VIP level. You are VIP ${user.vipLevel}, you can only request VIP ${user.vipLevel + 1}.` };
    }

    if (requestedGoldLevel > Object.keys(VIP_COST).length) {
        return { success: false, message: 'Requested VIP Level is too high or invalid.'};
    }

    if (!VIP_COST.hasOwnProperty(requestedGoldLevel)) {
        return { success: false, message: 'Invalid VIP Level configuration.' };
    }

    // Check for existing pending request
    if (user.paymentSlip && user.paymentSlip.status === 'pending') {
        return { success: false, message: 'You already have a pending upgrade request. Please wait for admin approval.' };
    }


    user.paymentSlip = {
      fileId: paymentProof, // Stores TxID (text) or Telegram file_id (for screenshot)
      status: 'pending',
      uploadedAt: new Date(),
    };
    user.requestedGoldLevel = requestedGoldLevel;

    await user.save();
    return { success: true, message: 'VIP purchase request submitted. Awaiting admin approval.', user };
  } catch (err) {
    console.error('Error in goldPurchaseRequest:', err.message);
    return { success: false, message: 'Internal server error.', error: err.message };
  }
};

// Handles a user's withdrawal request
exports.requestWithdrawal = async (telegramId, amountUSDT) => {
  try {
    if (!telegramId || !amountUSDT) return { success: false, message: 'Telegram ID and amount are required.' };
    if (isNaN(parseFloat(amountUSDT)) || parseFloat(amountUSDT) <= 0) return { success: false, message: 'Invalid withdrawal amount.' };

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found.' };
    if (!user.isVerified) return { success: false, message: 'Please verify your account first.' };
    if (user.vipLevel === 0) return { success: false, message: 'You must be a VIP member to withdraw.' };


    if (!user.paymentDetails || !user.paymentDetails.usdtWalletAddress) {
        return { success: false, message: 'Please add your USDT (TRC20) wallet address first via "💰 Add Wallet Address" or /addpaymentdetails.' };
    }

    const numericAmount = parseFloat(amountUSDT);
    if (numericAmount < MIN_WITHDRAWAL_AMOUNT) {
      return { success: false, message: `Minimum withdrawal amount is USDT ${MIN_WITHDRAWAL_AMOUNT}.` };
    }

    const totalDeduction = numericAmount + WITHDRAWAL_FEE;
    if (user.balance < totalDeduction) {
      return { success: false, message: `Insufficient balance. You need USDT ${totalDeduction.toFixed(2)} (USDT ${numericAmount.toFixed(2)} + USDT ${WITHDRAWAL_FEE} fee). Your balance: USDT ${user.balance.toFixed(2)}.` };
    }

    // Deduct balance immediately upon request
    user.balance -= totalDeduction;

    user.withdrawals.push({
      amount: numericAmount,
      fee: WITHDRAWAL_FEE,
      status: 'pending',
      requestedAt: new Date(),
    });

    await user.save();
    return { success: true, message: 'Withdrawal request submitted. It will be processed by an admin.', user };
  } catch (err) {
    console.error('Error in requestWithdrawal:', err.message);
    return { success: false, message: 'Internal server error.', error: err.message };
  }
};

// Admin: Approves or rejects a VIP purchase (VIP upgrade via payment proof)
exports.adminGoldApprove = async (mongoUserId, approve, botInstance) => {
  try {
    const user = await User.findById(mongoUserId);
    if (!user) return { success: false, message: 'User not found.' };

    if (!user.paymentSlip || user.paymentSlip.status !== 'pending' || !user.requestedGoldLevel) {
      return { success: false, message: 'No valid pending VIP purchase proof found for this user.' };
    }

    const newVIPLevel = user.requestedGoldLevel;
    const purchaseCost = VIP_COST[newVIPLevel];

    if (!purchaseCost) {
        user.paymentSlip.status = 'rejected'; // Mark as rejected if config is bad
        user.paymentSlip.processedAt = new Date();
        user.requestedGoldLevel = null;
        await user.save();
        return { success: false, message: `Invalid VIP cost configuration for Level ${newVIPLevel}. Request rejected.` };
    }

    if (approve) {
      // Ensure sequential upgrade
      if (newVIPLevel !== user.vipLevel + 1) {
        user.paymentSlip.status = 'rejected'; // Reject if trying to skip levels
        user.paymentSlip.processedAt = new Date();
        await user.save();
        return { success: false, message: `Invalid approval: User (VIP ${user.vipLevel}) trying to jump to VIP ${newVIPLevel}. Request rejected.` };
      }

      user.vipLevel = newVIPLevel;
      user.paymentSlip.status = 'approved';
      user.paymentSlip.processedAt = new Date();
      // user.paymentSlip.fileId remains for record

      if (!user.upgradeHistory) user.upgradeHistory = [];
      user.upgradeHistory.push({
          level: newVIPLevel,
          cost: purchaseCost,
          method: 'Gold Purchase (Proof)',
          approvedAt: new Date(),
          approvedBy: 'Admin (Proof)'
      });

      user.requestedGoldLevel = null; // Clear the requested level

      // Pay commission if a referrer exists
      if (user.referredBy) {
        await payCommission(user.referredBy, newVIPLevel, botInstance, user);
      }

    } else { // Reject
      user.paymentSlip.status = 'rejected';
      user.paymentSlip.processedAt = new Date();
      user.requestedGoldLevel = null;
    }

    await user.save();
    return { success: true, message: `VIP purchase ${approve ? 'approved' : 'rejected'} successfully.`, user };
  } catch (err) {
    console.error('Error in adminGoldApprove:', err.message);
    return { success: false, message: 'Internal server error.', error: err.message };
  }
};

// Admin: Processes (approves or rejects) a withdrawal request
exports.adminWithdrawalProcess = async (telegramId, withdrawalMongoId, approve) => {
  try {
    if (!telegramId || !withdrawalMongoId || typeof approve !== 'boolean') {
      return { success: false, message: 'Missing required fields.' };
    }

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found.' };

    const withdrawal = user.withdrawals.id(withdrawalMongoId);
    if (!withdrawal) return { success: false, message: 'Withdrawal request not found.' };
    if (withdrawal.status !== 'pending') return { success: false, message: 'Withdrawal request already processed.' };

    if (approve) {
      withdrawal.status = 'approved';
      withdrawal.processedAt = new Date();
      // Actual USDT transfer is done manually by admin. This just marks it in DB.
    } else { // Reject
      withdrawal.status = 'rejected';
      withdrawal.processedAt = new Date();
      // Refund the amount (including fee) to user's balance if rejected
      user.balance += (withdrawal.amount + withdrawal.fee);
    }

    await user.save();
    return { success: true, message: `Withdrawal request ${approve ? 'approved' : 'rejected'}.`, user };
  } catch (err) {
    console.error('Error in adminWithdrawalProcess:', err.message);
    // If error, and balance was deducted, consider how to handle (e.g. manual check)
    return { success: false, message: 'Internal server error.', error: err.message };
  }
};

// Updates user's payment details (USDT Wallet Address)
exports.updatePaymentDetails = async (telegramId, usdtWalletAddress) => {
  try {
    if (!telegramId || !usdtWalletAddress) return { success: false, message: 'Telegram ID and USDT Wallet Address are required.' };

    // Basic TRC20 address validation (starts with 'T', 34 characters)
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(usdtWalletAddress)) {
        return { success: false, message: 'Invalid USDT (TRC20) wallet address format.' };
    }

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found.' };

    if (!user.paymentDetails) user.paymentDetails = {}; // Ensure object exists
    user.paymentDetails.usdtWalletAddress = usdtWalletAddress;

    // Remove old bank details if they existed (schema migration)
    user.paymentDetails.bankName = undefined;
    user.paymentDetails.accountNumber = undefined;
    user.paymentDetails.accountName = undefined;
    user.paymentDetails.branch = undefined;

    await user.save();
    return { success: true, message: 'USDT Wallet address updated successfully.', user };
  } catch (err) {
    console.error('Error in updatePaymentDetails:', err.message);
    return { success: false, message: 'Internal server error.', error: err.message };
  }
};

// User requests to upgrade VIP using their account balance
exports.requestUpgradeFromBalance = async (telegramId, targetVIP) => {
    try {
        if (!telegramId || !targetVIP) {
            return { success: false, message: 'Telegram ID and target VIP level are required.' };
        }

        const user = await User.findOne({ telegramId: telegramId.toString() });
        if (!user) return { success: false, message: 'User not found.' };

        if (targetVIP !== user.vipLevel + 1) {
            return { success: false, message: `Invalid upgrade. You are VIP ${user.vipLevel}, you can only upgrade to VIP ${user.vipLevel + 1}.` };
        }

        if (targetVIP > Object.keys(VIP_COST).length) {
            return { success: false, message: 'Requested VIP Level is too high or invalid.'};
        }

        const cost = VIP_COST[targetVIP];
        if (!cost) {
            return { success: false, message: 'Invalid VIP Level cost configuration.' };
        }

        if (user.balance < cost) {
            return { success: false, message: `Insufficient balance. You need USDT ${cost.toFixed(2)} for VIP ${targetVIP}. Your balance: USDT ${user.balance.toFixed(2)}.` };
        }

        // Check for existing pending request (either by slip or balance)
        if ((user.paymentSlip && user.paymentSlip.status === 'pending') || (user.upgradeRequest && user.upgradeRequest.targetVIP)) {
            return { success: false, message: 'You already have a pending upgrade request. Please wait for admin approval.' };
        }

        user.upgradeRequest = {
            targetVIP: targetVIP,
            requestedAt: new Date()
        };
        // Balance is deducted upon admin approval, not here.
        await user.save();
        return { success: true, message: 'Upgrade request from balance submitted. Awaiting admin approval.', user };
    } catch (err) {
        console.error('Error in requestUpgradeFromBalance:', err.message);
        return { success: false, message: 'Internal server error.', error: err.message };
    }
};

// Admin approves or rejects a VIP upgrade request made from user's balance
exports.adminApproveUpgradeFromBalance = async (mongoUserId, approve, botInstance) => {
    try {
        const user = await User.findById(mongoUserId);
        if (!user) return { success: false, message: 'User not found.' };

        if (!user.upgradeRequest || !user.upgradeRequest.targetVIP) {
            return { success: false, message: 'No pending upgrade request from balance found for this user.' };
        }

        const targetVIP = user.upgradeRequest.targetVIP;
        const cost = VIP_COST[targetVIP];

        if (!cost) {
            user.upgradeRequest = null; // Clear invalid request
            await user.save();
            return { success: false, message: `Invalid VIP cost configuration for Level ${targetVIP}. Request cancelled.` };
        }

        if (approve) {
            // Re-check balance at approval time
            if (user.balance < cost) {
                // Don't nullify upgradeRequest here, admin might want to re-evaluate or user top up.
                // Or, nullify and inform admin clearly. For now, just return error.
                return { success: false, message: `User balance (USDT ${user.balance.toFixed(2)}) is insufficient for VIP ${targetVIP} (Cost: USDT ${cost}). Approval denied.` };
            }
             // Ensure sequential upgrade
            if (targetVIP !== user.vipLevel + 1) {
                user.upgradeRequest = null; // Clear invalid request
                await user.save();
                return { success: false, message: `Invalid approval: User (VIP ${user.vipLevel}) trying to jump to VIP ${targetVIP} via balance. Request cancelled.` };
            }

            user.balance -= cost;
            user.vipLevel = targetVIP;


            if (!user.upgradeHistory) user.upgradeHistory = [];
            user.upgradeHistory.push({
                level: targetVIP,
                cost: cost,
                method: 'Balance',
                approvedAt: new Date(),
                approvedBy: 'Admin (Balance)'
            });

            // Pay commission if a referrer exists
            if (user.referredBy) {
                await payCommission(user.referredBy, targetVIP, botInstance, user);
            }
        }
        // For both approve and reject, clear the request
        user.upgradeRequest = null;
        await user.save();
        return { success: true, message: `Upgrade request from balance ${approve ? 'approved' : 'rejected'}.`, user };
    } catch (err) {
        console.error('Error in adminApproveUpgradeFromBalance:', err.message);
        return { success: false, message: 'Internal server error.', error: err.message };
    }
};

// Fetches all user statistics (summary for admin)
exports.getAllUserStats = async () => {
  try {
    const users = await User.find({}).select('fullName username telegramId vipLevel upgradeHistory withdrawals balance commissionEarned');

    let overallTotalDepositsUSDT = 0;
    let overallTotalWithdrawalsUSDT = 0;
    let overallTotalCommissionsUSDT = 0;

    const usersWithCalculatedStats = users.map(user => {
      const userUpgradeHistory = user.upgradeHistory || [];
      const userWithdrawals = user.withdrawals || [];

      const userDepositedUSDT = userUpgradeHistory.reduce((sum, upgrade) => {
        // Ensure upgrade.cost is a number, default to 0 if not
        return sum + (typeof upgrade.cost === 'number' ? upgrade.cost : 0);
      }, 0);

      const userWithdrawalsApprovedUSDT = userWithdrawals.reduce((sum, withdrawal) => {
        return sum + (withdrawal.status === 'approved' && typeof withdrawal.amount === 'number' ? withdrawal.amount : 0);
      }, 0);

      const userTotalCommissionEarnedUSDT = typeof user.commissionEarned === 'number' ? user.commissionEarned : 0;

      overallTotalDepositsUSDT += userDepositedUSDT;
      overallTotalWithdrawalsUSDT += userWithdrawalsApprovedUSDT;
      overallTotalCommissionsUSDT += userTotalCommissionEarnedUSDT;

      return {
        _id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        fullName: user.fullName,
        vipLevel: user.vipLevel,
        totalDepositedUSDT: userDepositedUSDT,
        totalApprovedWithdrawalsUSDT: userWithdrawalsApprovedUSDT,
        currentBalanceUSDT: user.balance,
        totalCommissionEarnedUSDT: userTotalCommissionEarnedUSDT
      };
    });

    return {
      success: true,
      users: usersWithCalculatedStats,
      totalDepositsUSDT: overallTotalDepositsUSDT,
      totalWithdrawalsUSDT: overallTotalWithdrawalsUSDT,
      totalCommissionsUSDT: overallTotalCommissionsUSDT
    };

  } catch (err) {
    console.error('Error in getAllUserStats:', err.message);
    return { success: false, message: 'Internal server error.', error: err.message };
  }
};

// Fetches details for a single user
exports.getUserDetails = async (telegramId) => {
  try {
    if (!telegramId) return { success: false, message: 'Telegram ID is required.' };
    // Exclude paymentSlip (proofs) by default unless specifically needed for a view
    const user = await User.findOne({ telegramId: telegramId.toString() }).select('-paymentSlip');
    if (!user) return { success: false, message: 'User not found.' };
    return { success: true, user };
  } catch (err) {
    console.error('Error in getUserDetails:', err.message);
    return { success: false, message: 'Internal server error.', error: err.message };
  }
};
