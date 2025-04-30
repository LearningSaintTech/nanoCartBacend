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
        cartItemId: {type: mongoose.Schema.Types.ObjectId},
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
      enum: ["Online", "COD"],
    },
    isWalletAmountUsed:{
      type:Boolean,
      default:false
    },
    walletAmountUsed: { type: Number, default: 0 },
    
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },

    walletTransactionId: { type: String, default: null },
    walletRefundTransactionId: { type: String, default: null },
    walletRefundAmount: { type: Number, default: 0 },

    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },
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
    cancellationReason:{
      type:String
    },
    bankDetails: {
      accountNumber: { type: String,trim: true },
      ifscCode: { type: String ,trim: true},
      branchName: { type: String},
      accountName: { type: String },
    },
    bankDetailsRefundTransctionId:{type:String,default:null},
    
    deliveredAt: { type: Date, default:Date.now() },
    returnedAt:{type: Date}
  },
  { timestamps: true }
);

module.exports = mongoose.model("PartnerOrder", orderSchema);
