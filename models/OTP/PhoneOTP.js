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
    default: () => new Date(Date.now() + 5 * 60 * 1000), // Expires in 5 minutes
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });


module.exports = mongoose.model("PhoneOtp", phoneOtpSchema);
