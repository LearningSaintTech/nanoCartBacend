const mongoose = require("mongoose");

const WalletSchema = new mongoose.Schema({
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Partner",
    required: true,
    unique: true,
    index: true,
  },
  totalBalance: {
    type: Number,
    required: true,
    default: 0,
    min: [0, "Balance cannot be negative"],
  },
  currency: {
    type: String,
    default: "INR",
    required: true,
    enum: ["INR"], // Add more currencies if needed
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  transactions: [
    {
      type: {
        type: String,
        enum: ["credit", "debit"],
        required: true,
      },
      amount: {
        type: Number,
        required: true,
        min: [0, "Amount cannot be negative"],
      },
      description: {
        type: String,
        trim: true,
        default: "",
      },
      orderId: {
        type: String,
      },
      status: {
        type: String,
        enum: ["pending", "completed", "failed"],
        default: "completed",
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Middleware to update `updatedAt` on every save
WalletSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Wallet", WalletSchema);