// utils/pricing.js

const { VIP_COST } = require('../constants'); // Assuming constants.js is in the parent directory or configured in require paths

/**
 * Gets the cost for a specific Gold/VIP level.
 * @param {number} level - The VIP level.
 * @returns {number} The cost of the level, or 0 if the level is not found or invalid.
 */
function getGoldCost(level) {
    if (typeof level !== 'number' || level < 1) {
        console.warn(`getGoldCost: Invalid level provided: ${level}`);
        return 0;
    }
    return VIP_COST[level] || 0; // Return 0 if level not defined in VIP_COST
}

module.exports = {
    getGoldCost
};
