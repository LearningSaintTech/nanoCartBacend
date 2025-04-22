const mongoose = require("mongoose");

const partnerSchema = new mongoose.Schema({
  partner: { // this is userId
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isPhoneVerified: {
    type: Boolean,
    default: false,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  isProfile: {
    type: Boolean,
    default: false,
  },
  isAddress: {
    type: Boolean,
    default: false,
  },
  imageShop: {
    type: String,
  },
  
});

module.exports = mongoose.model("Partner", partnerSchema);
