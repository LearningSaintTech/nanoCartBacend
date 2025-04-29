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
        cartItems: {type: mongoose.Schema.Types.ObjectId},
      },
    ],
    invoice: [
      {
        key: {
          type: String,
          trim: true,
          lowercase: true,
          required: true,
        },
        value: {
          type: String,
          required: true,
        },
      },
    ],
    shippingAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PartnerAddress",
    },
    paymentMethod: {
      type: String,
      enum: ["Online", "COD", "Wallet"],
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },

    orderStatus: {
      type: String,
      enum: [
        "In transit",
        "Confirmed",
        "Ready for Dispatch",
        "Dispatched",
        "Delivered",
        "Order Returned",
        "Refund to Wallet",
      ],
      default: "In transit",
    },
    isOrderPlaced: { type: Boolean, default: false },
    isOrderCancelled: {
      type: Boolean,
      default: false,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    bankDetails: {
      accountNumber: { type: String },
      ifscCode: { type: String },
      branchName: { type: String },
      accountName: { type: String },
    },
    bankDetailsRefundTransctionId:{type:String},
    deliveryDate: { type: Date, default:Date.now() },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PartnerOrder", orderSchema);
