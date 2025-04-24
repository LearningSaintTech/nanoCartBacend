const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
    },
    orderDetails: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
          required: true,
        },
        color: { type: String },
        size: { type: String },
        quantity: { type: Number, min: 1, required: true },
        skuId: { type: String },
      },
    ],
    invoice:{
      key: {
        type: String,
        trim: true,
        lowercase: true,
      },
      values: [
        {
          type: String,
        },
      ],
    },
    shippingAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PartnerAddress",
    },
    paymentMethod: {
      type: String,
      enum: ["Online", "COD","Wallet"],
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },

    isOrderPlaced: { type: Boolean, default: false },
    orderStatus: {
      type: String,
      enum: [
        "In transit",
        "Initiated",
        "Confirmed",
        "Ready for Dispatch",
        "Dispatched",
        "Delivered",
        "Cancelled",
        "Returned",
      ],
      default: "In transit",
    },

    refund: {
      isRefundActive: { type: Boolean, default: false },
      requestDate: { type: Date, default: null },
      status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected", "Initiated", "Processed"],
        default: "Pending",
      },
      amount: {
        type: Number,
        min: 0,
        default: null,
      },
      reason: { type: String },
      refundTransactionId: { type: String, default: null },
      refundStatus: {
        type: String,
        enum: ["Initiated", "Processing", "Completed", null],
        default: null,
      },
      pickupLocation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "UserAddress",
        default: null,
      },
      refundMethod: {
        type: String,
        enum: ["Bank Transfer", "Original Payment Method", null],
        default: null,
      },
    },

    bankDetails: {
      type: {
        accountNumber: String,
        ifscCode: String,
        branchName: String,
        accountName: String,
      },
      default: null,
    },
    deliveryDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PartnerOrder", orderSchema);
