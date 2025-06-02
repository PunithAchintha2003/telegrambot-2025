// constants.js

// Renamed from VIP_COST to VIP_COST
const VIP_COST = {
  1: 10,
  2: 20,
  3: 40,
  4: 60,
  5: 80,
  6: 100,
  7: 200,
  8: 400,
  9: 600,
  10: 800,
  // Assuming VIP 11 was a typo and meant to be a higher cost or not exist.
  // If VIP 11 is intended, its cost should be higher than VIP 10.
  // For now, I'll keep it as is from your original file.
  11: 1000
};

const WITHDRAWAL_FEE = 3; // This would be in USDT, ensure conversion if fee is in USDT
const MIN_WITHDRAWAL_AMOUNT = 10; // This would be in USDT

const VIP_COMMISSION_PAYOUTS = [
    5,  // Corresponds to VIP 1
    5,  // Corresponds to VIP 2
    10, // Corresponds to VIP 3
    15, // Corresponds to VIP 4
    20, // Corresponds to VIP 5
    25, // Corresponds to VIP 6
    50, // Corresponds to VIP 7
    100,// Corresponds to VIP 8
    150,// Corresponds to VIP 9
    200,// Corresponds to VIP 10
    250 // Corresponds to VIP 11 (assuming 11 VIP levels)
];

// Add the support bot username here
const SUPPORT_BOT_USERNAME = 'TombX_Help_bot'; // Your help bot's username

// Admin's USDT TRC20 address for receiving VIP payments
const ADMIN_USDT_TRC20_ADDRESS = 'TVgu29sACwqHgfe1AK1kL8np9a7iRY5NnJ';

module.exports = {
  VIP_COST,
  WITHDRAWAL_FEE,
  MIN_WITHDRAWAL_AMOUNT,
  VIP_COMMISSION_PAYOUTS,
  SUPPORT_BOT_USERNAME,
  ADMIN_USDT_TRC20_ADDRESS, // Export admin's USDT address
};
