// utils/commission.js

const User = require('../models/User'); // Adjust path as necessary
const { VIP_COMMISSION_PAYOUTS } = require('../constants');

/**
 * Calculates and pays commission to a referrer.
 * @param {string} referrerCode - The referral code of the user who referred.
 * @param {number} purchasedVipLevel - The VIP level purchased by the referred user.
 * @param {object} bot - The Telegram bot instance for sending notifications.
 * @param {object} referredUser - The user object of the person who made the VIP purchase.
 * @returns {Promise<{success: boolean, message: string, amount?: number}>}
 */
async function payCommission(referrerCode, purchasedVipLevel, bot, referredUser) {
    try {
        if (!referrerCode) {
            // This case should ideally not happen if referredBy is always set for referred users.
            console.log(`Commission: No referrer code provided for user ${referredUser.telegramId}. No commission paid.`);
            return { success: false, message: "No referrer code available." };
        }

        const referrer = await User.findOne({ referralCode: referrerCode });

        if (!referrer) {
            console.warn(`Commission: Referrer with code ${referrerCode} not found. User ${referredUser.telegramId} purchased VIP ${purchasedVipLevel}.`);
            return { success: false, message: "Referrer not found." };
        }

        // Ensure the purchased level is valid for commission payouts
        if (purchasedVipLevel < 1 || purchasedVipLevel > VIP_COMMISSION_PAYOUTS.length) {
            console.warn(`Commission: Invalid purchased VIP Level ${purchasedVipLevel} by ${referredUser.telegramId}. No commission for referrer ${referrer.telegramId}.`);
            return { success: false, message: "Invalid purchased VIP level for commission calculation." };
        }

        // Commission is based on the VIP level *purchased by the referred user*.
        // The referrer's own VIP level determines if they are *eligible* to receive this commission.
        const commissionForPurchasedLevel = VIP_COMMISSION_PAYOUTS[purchasedVipLevel - 1]; // Array is 0-indexed

        // Referrer must be at least VIP 1 to earn any commission.
        if (referrer.vipLevel < 1) {
            console.log(`Commission: Referrer ${referrer.telegramId} (VIP ${referrer.vipLevel}) is not eligible for commission from ${referredUser.telegramId}'s VIP ${purchasedVipLevel} purchase.`);
            return { success: false, message: "Referrer is not VIP 1 or higher, thus not eligible for commission." };
        }

        // The actual commission earned by the referrer is the commission associated with the *referred user's new VIP level*,
        // provided the referrer is VIP 1 or higher.
        // Some systems might cap the commission based on the referrer's own VIP level (e.g., a VIP 1 referrer cannot earn VIP 5 commission).
        // Your current VIP_COMMISSION_PAYOUTS seems to imply a direct payout based on the purchased level.
        // If you want to cap it, you'd do:
        // const maxCommissionReferrerCanEarn = VIP_COMMISSION_PAYOUTS[Math.min(referrer.vipLevel, VIP_COMMISSION_PAYOUTS.length) - 1];
        // const earnedCommission = Math.min(commissionForPurchasedLevel, maxCommissionReferrerCanEarn);
        // For now, let's assume direct payout if referrer is VIP 1+
        const earnedCommission = commissionForPurchasedLevel;


        if (earnedCommission > 0) {
            referrer.balance += earnedCommission;
            referrer.commissionEarned = (referrer.commissionEarned || 0) + earnedCommission;
            await referrer.save();

            // Notify referrer
            if (bot && referrer.telegramId) {
                const referredUserName = referredUser.fullName || referredUser.username || `User ${referredUser.telegramId.slice(-4)}`;
                try {
                    await bot.sendMessage(referrer.telegramId,
                        `💰 Congratulations! You've earned USDT ${earnedCommission.toFixed(2)} commission. ` +
                        `Your referred user, ${referredUserName}, has upgraded to VIP Level ${purchasedVipLevel}.`
                    );
                } catch (notifyError) {
                    console.error(`Commission: Failed to notify referrer ${referrer.telegramId} about commission. Error: ${notifyError.message}`);
                }
            }
            console.log(`Commission: USDT ${earnedCommission.toFixed(2)} awarded to ${referrer.telegramId} (VIP ${referrer.vipLevel}) from ${referredUser.telegramId}'s VIP ${purchasedVipLevel} purchase.`);
            return { success: true, message: "Commission paid successfully.", amount: earnedCommission };
        } else {
            console.log(`Commission: Calculated commission was 0 or less for referrer ${referrer.telegramId} from user ${referredUser.telegramId} (purchased VIP level ${purchasedVipLevel}).`);
            return { success: false, message: "No eligible commission amount calculated." };
        }

    } catch (error) {
        console.error("Error in payCommission utility:", error);
        return { success: false, message: "Internal server error during commission payment." };
    }
}

module.exports = {
    payCommission,
};
