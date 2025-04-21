const mongoose = require("mongoose");
const Wallet = require("../../models/Partner/PartnerWallet"); // Adjust path to Wallet model
const apiResponse = require("../../utils/apiResponse"); // Adjust path to apiResponse utility


// Create a new wallet for a partner (INR)
exports.createWallet = async (req, res) => {
  try {
    const { partnerId } = req.user;

    const existing = await Wallet.findOne({ partnerId });
    if (existing) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Wallet already exists for this partner"));
    }

    const wallet = new Wallet({
      partnerId,
      totalBalance: 0,
      currency: "INR",
      isActive: true,
    });
    await wallet.save();

    return res
      .status(201)
      .json(
        apiResponse(201, true, "Wallet created successfully", wallet)
      );
  } catch (error) {
    console.error("Error in createWallet (Partner):", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


exports.addFunds = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { amount, description} = req.body;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Valid amount in INR is required"));
    }
    if (!Number.isInteger(amount)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Amount must be in whole rupees"));
    }
   

    const wallet = await Wallet.findOne({ partnerId });
    if (!wallet) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            false,
            "Wallet not created. Please create wallet first"
          )
        );
    }

    wallet.transactions.push({
      type: "credit",
      amount,
      description: description || "Top-up in INR",
      status: "completed",
    });
    wallet.totalBalance += amount;
    await wallet.save();

    return res
      .status(200)
      .json(
        apiResponse(200, true, "Funds added successfully",wallet)
      );
  } catch (error) {
    console.error("Error in addFunds (Partner):", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


// Deduct funds from partner's wallet (INR)
exports.deductFunds = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { amount, orderId, description} = req.body;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Valid amount in INR is required"));
    }
    if (!Number.isInteger(amount)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Amount must be in whole rupees"));
    }
    if (orderId && !mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Invalid orderId"));
    }

    const wallet = await Wallet.findOne({ partnerId });
    if (!wallet) {
      return res.status(404).json(apiResponse(404, false, "Wallet not found"));
    }

    if (wallet.totalBalance < amount) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Insufficient balance in INR"));
    }

    wallet.transactions.push({
      type: "debit",
      amount,
      description: description || "Payment in INR",
      orderId: orderId || undefined,
      status: "completed",
    });
    wallet.totalBalance -= amount;
    await wallet.save();

    return res
      .status(200)
      .json(
        apiResponse(200, true, "Funds deducted successfully", wallet)
      );
  } catch (error) {
    console.error("Error in deductFunds (Partner):", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};



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



// Toggle wallet active status (INR)
exports.toggleWalletStatus = async (req, res) => {
  try {
    const { partnerId } = req.user;

    // Find wallet
    const wallet = await Wallet.findOne({ partnerId });
    if (!wallet) {
      return res.status(404).json(apiResponse(404, false, "Wallet not found"));
    }

    // Toggle isActive status
    const newStatus = !wallet.isActive;
    wallet.isActive = newStatus;
    await wallet.save();

    const message = newStatus
      ? "Wallet activated successfully"
      : "Wallet deactivated successfully";

    return res
      .status(200)
      .json(
        apiResponse(200, true, message, {
          wallet,
          currency: wallet.currency,
        })
      );
  } catch (error) {
    console.error("Error in toggleWalletStatus (Partner):", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


exports.getTransactionHistory = async (req, res) => {
  try {
    const { partnerId } = req.params;

    const wallet = await Wallet.findOne({ partnerId });
    if (!wallet) {
      return res.status(404).json(apiResponse(404, false, "Wallet not found"));
    }

    // Format transaction log
    const transactionLog = wallet.transactions
      .sort((a, b) => b.createdAt - a.createdAt) // latest first
      .map(txn => ({
        date: txn.createdAt.toISOString(), 
        orderId: txn.orderId,
        description: txn.description,
        amount: txn.amount
      }));

    res.status(200).json();
    res.status(200).json(apiResponse(200,true,"Fetech Successfully",{
      balance: wallet.totalBalance,
      transactionLog
    }));
  } catch (error) {
    res.status(500).json(apiResponse(500,false,error.message));
  }
};