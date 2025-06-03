// constants.js

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
  11: 1000,
  12: 2000
};

const WITHDRAWAL_FEE = 3; // This would be in USDT
const MIN_WITHDRAWAL_AMOUNT = 10; // This would be in USDT

// This array defines the maximum commission a referrer can earn from a single referred user's upgrade,
// based on the referrer's own VIP level.
const VIP_COMMISSION_PAYOUTS = [
    5,  // Max commission for a VIP 1 referrer
    5,  // Max commission for a VIP 2 referrer
    10, // Max commission for a VIP 3 referrer
    15, // Max commission for a VIP 4 referrer
    20, // Max commission for a VIP 5 referrer
    25, // Max commission for a VIP 6 referrer
    50, // Max commission for a VIP 7 referrer
    100,// Max commission for a VIP 8 referrer
    150,// Max commission for a VIP 9 referrer
    200,// Max commission for a VIP 10 referrer
    250, // Max commission for a VIP 11 referrer
    500 // Max commission for a VIP 12 referrer
];

const GENERAL_COMMISSION_RATE = 0.25; // 25% for purchases of VIP 2 and above
const VIP1_PURCHASE_COMMISSION_RATE = 0.50; // 50% for purchases of VIP 1

const SUPPORT_BOT_USERNAME = 'TombX_Help_bot'; // Your help bot's username
const ADMIN_USDT_TRC20_ADDRESS = 'TVgu29sACwqHgfe1AK1kL8np9a7iRY5NnJ';

module.exports = {
  VIP_COST,
  WITHDRAWAL_FEE,
  MIN_WITHDRAWAL_AMOUNT,
  VIP_COMMISSION_PAYOUTS, // Kept for capping logic
  GENERAL_COMMISSION_RATE, // Added
  VIP1_PURCHASE_COMMISSION_RATE, // Added
  SUPPORT_BOT_USERNAME,
  ADMIN_USDT_TRC20_ADDRESS,
};