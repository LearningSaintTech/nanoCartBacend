const mongoose = require("mongoose");
const Wallet = require("../../models/Partner/PartnerWallet"); // Adjust path to Wallet model
const {apiResponse} = require("../../utils/apiResponse"); // Adjust path to apiResponse utility


// Get partner's wallet details (INR)
exports.getWalletDetails = async (req, res) => {
  try {
    const { partnerId } = req.user;

    const wallet = await Wallet.findOne({ partnerId:partnerId });
    if (!wallet) {
      return res.status(404).json(apiResponse(404, false, "Wallet not found"));
    }

    return res
      .status(200)
      .json(
        apiResponse(200, true, "Wallet details retrieved successfully", wallet)
      );
  } catch (error) {
    console.error("Error in getWalletDetails (Partner):", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


