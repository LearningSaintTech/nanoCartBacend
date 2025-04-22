const express = require("express");
const router = express.Router();
const {
  createWallet,
  addFunds,
  deductFunds,
  getWalletDetails,
} = require("../../controllers/partnerController/partnerWalletController"); // Adjust path as needed
const {verifyToken} = require("../../middlewares/verifyToken"); // Adjust path as needed
const {isPartner} = require("../../middlewares/isPartner"); // Adjust path as needed


// Create a new wallet for a partner (INR)
router.post("/create", verifyToken,isPartner, createWallet);

// Add funds to partner's wallet (INR)
router.post("/add-funds", verifyToken, isPartner,addFunds);

// Deduct funds from partner's wallet (INR)
router.post("/deduct-funds", verifyToken, isPartner,deductFunds);

// Get partner's wallet details (INR)
router.get("/", verifyToken,isPartner, getWalletDetails);



module.exports = router;