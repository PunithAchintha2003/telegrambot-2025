// models/User.js

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String, default: null, sparse: true }, // Added sparse index for optional unique usernames
  fullName: { type: String, default: null },

  // Referral system
  referralCode: { type: String, required: true, unique: true, index: true }, // Keep index: true here
  referredBy: { type: String, default: null, index: true }, // Keep index: true here

  isVerified: { type: Boolean, default: false },

  // VIP membership and balance
  vipLevel: { type: Number, default: 0 },
  requestedGoldLevel: { type: Number, default: null },
  balance: { type: Number, default: 0 }, // User's balance in USDT
  commissionEarned: { type: Number, default: 0 }, // Total commission earned in USDT

  // Request to buy VIP using account balance
  upgradeRequest: {
    targetVIP: { type: Number, default: null },
    requestedAt: { type: Date, default: null },
    // index: { targetVIP: 1 }, // Optional: Index if frequently querying pending upgrades
  },

  // Payment proof (slip/TxID) upload for Gold purchase approval
  paymentSlip: { // Consider renaming to paymentProof if it makes more sense
    fileId: { type: String, default: null }, // Telegram file ID (for screenshot) or TxID text
    status: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null, index: true }, // Keep index: true here
    uploadedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null }
  },

  // Withdrawal requests log
  withdrawals: {
    type: [{
      amount: { type: Number, required: true }, // Amount in USDT
      fee: { type: Number, required: true },    // Fee in USDT
      // usdtAmount: { type: Number }, // Optional: if you want to store the converted USDT amount
      // transactionId: { type: String }, // Optional: if admin provides TxID after sending USDT
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true }, // Keep index: true here
      requestedAt: { type: Date, default: Date.now },
      processedAt: { type: Date, default: null }
    }],
    default: []
  },

  // Upgrade history for VIP levels
  upgradeHistory: {
    type: [
      {
        level: { type: Number, required: true },
        cost: { type: Number, required: true }, // Cost in USDT
        method: { type: String, required: true, enum: ['Gold Purchase (Proof)', 'Balance'] }, // Method of upgrade
        approvedAt: { type: Date, required: true },
        approvedBy: { type: String, default: 'Admin' } // Could be 'Admin (Proof)' or 'Admin (Balance)'
      }
    ],
    default: []
  },

  // Payment details for withdrawals (USDT TRC20 Wallet)
  paymentDetails: {
    usdtWalletAddress: { type: String, default: null } // Stores user's TRC20 USDT Wallet Address
  }
}, { timestamps: true }); // Adds createdAt and updatedAt timestamps

// ---

// Index for frequently queried fields
// KEEP these as they are not defined with 'index: true' directly in the schema,
// or use sparse: true for the upgradeRequest index.
userSchema.index({ vipLevel: 1 });
userSchema.index({ 'upgradeRequest.targetVIP': 1 }, { sparse: true }); // Sparse index for pending upgrades

// REMOVED DUPLICATE INDEXES:
// userSchema.index({ telegramId: 1 }); // Already covered by unique: true and implied index
// userSchema.index({ 'paymentSlip.status': 1 }); // Already covered by index: true in the field
// userSchema.index({ 'withdrawals.status': 1 }); // Already covered by index: true in the field

module.exports = mongoose.model('User', userSchema);