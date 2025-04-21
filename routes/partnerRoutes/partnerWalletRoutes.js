const express = require("express");
const router = express.Router();
const {
  createWallet,
  addFunds,
  deductFunds,
  getWalletDetails,
  toggleWalletStatus,
  getTransactionHistory,
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

// Toggle wallet active status (INR)
router.post("/toggle-status", verifyToken,isPartner, toggleWalletStatus);

// Get transaction history in date, orderId, description, amount format
router.get(
    "/:partnerId/transaction-history",
    getTransactionHistory
  );

module.exports = router;