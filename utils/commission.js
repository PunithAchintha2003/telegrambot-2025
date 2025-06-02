// utils/commission.js

const User = require('../models/User'); // Adjust path as necessary
const {
    VIP_COST,
    VIP_COMMISSION_PAYOUTS,
    GENERAL_COMMISSION_RATE,
    VIP1_PURCHASE_COMMISSION_RATE
} = require('../constants');

/**
 * Calculates and pays commission to a referrer based on the revised logic:
 * - If referred buys VIP 1, commission is 50% of VIP 1 cost.
 * - If referred buys VIP > 1, commission is 25% of that VIP level's cost.
 * - This commission is capped by the referrer's own max payout (from VIP_COMMISSION_PAYOUTS).
 * - Referrer must be VIP 1 or higher.
 * @param {string} referrerCode - The referral code of the user who referred.
 * @param {number} purchasedVipLevel - The VIP level purchased by the referred user.
 * @param {object} bot - The Telegram bot instance for sending notifications.
 * @param {object} referredUser - The user object of the person who made the VIP purchase.
 * @returns {Promise<{success: boolean, message: string, amount?: number}>}
 */
async function payCommission(referrerCode, purchasedVipLevel, bot, referredUser) {
    try {
        if (!referrerCode) {
            console.log(`Commission: No referrer code provided for user ${referredUser.telegramId}. No commission paid.`);
            return { success: false, message: "No referrer code available." };
        }

        const referrer = await User.findOne({ referralCode: referrerCode });

        if (!referrer) {
            console.warn(`Commission: Referrer with code ${referrerCode} not found. User ${referredUser.telegramId} purchased VIP ${purchasedVipLevel}.`);
            return { success: false, message: "Referrer not found." };
        }

        if (referrer.vipLevel < 1) {
            console.log(`Commission: Referrer ${referrer.telegramId} (VIP ${referrer.vipLevel}) is not eligible. Must be VIP 1+.`);
            return { success: false, message: "Referrer is not VIP 1 or higher, thus not eligible for commission." };
        }

        const costOfPurchasedVIP = VIP_COST[purchasedVipLevel];
        if (typeof costOfPurchasedVIP !== 'number' || costOfPurchasedVIP <= 0) {
            console.warn(`Commission: Invalid cost for purchased VIP Level ${purchasedVipLevel}. No commission for ${referrer.telegramId}.`);
            return { success: false, message: "Invalid cost for purchased VIP level." };
        }

        let applicableCommissionRate;
        if (purchasedVipLevel === 1) {
            applicableCommissionRate = VIP1_PURCHASE_COMMISSION_RATE; // 0.50
        } else {
            applicableCommissionRate = GENERAL_COMMISSION_RATE; // 0.25
        }

        const potentialCommission = costOfPurchasedVIP * applicableCommissionRate;

        // Determine the capping commission based on the referrer's VIP level
        // VIP_COMMISSION_PAYOUTS is 0-indexed, referrer.vipLevel is 1-indexed
        const cappingCommission = VIP_COMMISSION_PAYOUTS[referrer.vipLevel - 1];
        if (typeof cappingCommission !== 'number' || cappingCommission < 0) {
            console.error(`Commission: Invalid capping commission for referrer's VIP Level ${referrer.vipLevel}. Referrer ID: ${referrer.telegramId}. Check VIP_COMMISSION_PAYOUTS.`);
            return { success: false, message: "Invalid cap configuration for referrer's VIP level." };
        }

        let earnedCommission = Math.min(potentialCommission, cappingCommission);
        earnedCommission = parseFloat(earnedCommission.toFixed(2)); // Round to 2 decimal places

        if (earnedCommission > 0) {
            referrer.balance += earnedCommission;
            referrer.commissionEarned = (referrer.commissionEarned || 0) + earnedCommission;
            await referrer.save();

            if (bot && referrer.telegramId) {
                const referredUserName = referredUser.fullName || referredUser.username || `User ${referredUser.telegramId.slice(-4)}`;
                try {
                    await bot.sendMessage(referrer.telegramId,
                        `💰 Congratulations! You've earned USDT ${earnedCommission.toFixed(2)} commission. ` +
                        `Your referred user, ${referredUserName}, has upgraded to VIP Level ${purchasedVipLevel}.`
                    );
                } catch (notifyError) {
                    console.error(`Commission: Failed to notify referrer ${referrer.telegramId}. Error: ${notifyError.message}`);
                }
            }
            console.log(`Commission: USDT ${earnedCommission.toFixed(2)} awarded to ${referrer.telegramId} (VIP ${referrer.vipLevel}) from ${referredUser.telegramId}'s VIP ${purchasedVipLevel} purchase. Rate applied: ${applicableCommissionRate*100}%. Potential: ${potentialCommission.toFixed(2)}, Cap: ${cappingCommission.toFixed(2)}.`);
            return { success: true, message: "Commission paid successfully.", amount: earnedCommission };
        } else {
            console.log(`Commission: Calculated 0 or less for ${referrer.telegramId} from ${referredUser.telegramId}'s VIP ${purchasedVipLevel} purchase. Rate: ${applicableCommissionRate*100}%. Potential: ${potentialCommission.toFixed(2)}, Cap: ${cappingCommission.toFixed(2)}.`);
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