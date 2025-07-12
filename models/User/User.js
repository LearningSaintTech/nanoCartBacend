const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
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
  role:{
    type:String,
    enum:["Admin","User","Partner"],
    default: "User",
  },
  isPhoneVerified: {
    type: Boolean,
    default: false, 
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  isFakeUser: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  isPartner:{
    type: Boolean,
    default: false,
  },
  isAddress: {
    type: Boolean,
    default: false,
  },
  TBYB: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TBYB",
  },
});

module.exports = mongoose.model("User", UserSchema);
