const mongoose = require("mongoose");

const PartnerProfileSchema = new mongoose.Schema({
  partnerId:{
    type: mongoose.Schema.Types.ObjectId,
    ref:"Partner"
  },
  shopName: {
    type: String,
    required: true
  },
  gstNumber: {
    type: String,
    unique: true 
  },
  panNumber: {
    type: String,
    required: true,
    unique: true
  },
  shopAddress: {
    type: String,
    required: true
  },
  pincode: {
    type: String,
    required: true
  },
  townCity: {
    type: String,
  },
  state: {
    type: String,
  }
}, { timestamps: true });

const PartnerProfile = mongoose.model("PartnerProfile", PartnerProfileSchema);

module.exports = PartnerProfile;
