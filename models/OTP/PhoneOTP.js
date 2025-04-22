const mongoose = require("mongoose");

const phoneOtpSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    match: [/^\d{10}$/, "Please enter a valid 10-digit phone number"],
  },
  otp: {
    type: String,
    required: true, 
  },
  expiresAt: { 
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// TTL Index for auto-expiry
phoneOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PhoneOtp", phoneOtpSchema);
