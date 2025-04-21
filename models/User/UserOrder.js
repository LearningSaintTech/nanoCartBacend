const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Order Items
    items: [
      {
        itemDetails: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ItemDetails",
          required: true,
        },
        color: {
          type: String,
        },
        size: {
          type: String,
        },
      },
    ],

    totalPrice: {
      type: Number,
      required: true,
    },

    // Shipping Information
    shippingAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAddress",
    },

    // Payment Information
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },
    razorpayOrderId: {
      type: String,
      required: true,
    },
    razorpayPaymentId: {
      type: String,
      required: true,
    },
    razorpaySignature: {
      type: String,
      required: true,
    },
    // Order Status
    shippingStatus: {
      type: String,
      enum: [
        "Pending",
        "Confirmed",
        "Processing",
        "Shipped",
        "Out for Delivery",
        "Delivered",
        "Cancelled",
        "Returned",
      ],
      default: "Pending",
    },
    skuId: {
      type: String,
    },

    // Refund (Return) Subdocument
    refund: {
      requestDate: { type: Date, default: null },
      status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected", "Processed", "Initiated"],
        default: "Pending",
      },
      amount: { type: Number, default: null },
      reason: {
        type: String,
      },
      refundTransactionId: { type: String, sparse: true },
      refundStatus: { type: String, sparse: true },
      notes: { type: String, sparse: true },
    },

    exchange: {
      requestDate: { type: Date, default: null },
      status: {
        type: String,
        enum: [
          "Pending",
          "Approved",
          "Rejected",
          "Shipped",
          "Shiprocket_Shipped",
        ],
        default: "Pending",
      },
      newItemId: { type: mongoose.Schema.Types.ObjectId, ref: "ItemDetails" },
      notes: { type: String, sparse: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserOrder", orderSchema);
