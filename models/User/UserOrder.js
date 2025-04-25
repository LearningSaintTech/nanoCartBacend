const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
        isItemCancel: {
          type: Boolean,
          default: false,
        },

        isItemExchange: {
          type: Boolean,
          default: false,
        },
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
      ref: "UserAddress",
    },
    paymentMethod: {
      type: String,
      enum: ["Online", "COD"],
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
        "Initiated",
        "Confirmed",
        "Ready for Dispatch",
        "Dispatched",
        "Delivered",
        "Cancelled",
        "Returned",
        "Partiallycancelled",
      ],
      default: "Initiated",
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
    cancelStatus: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
          required: true,
        },
        cancelOrderStatus: {
          type: String,
          enum: ["confirmed", "order Cancelled", "Refund Inititated"],
        },
      },
    ],

    refund: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
          required: true,
        },
        refundReason: { type: String },
        requestDate: { type: Date, default: null },
        refundAmount: {
          type: Number,
          min: 0,
          default: null,
        },
        refundTransactionId: { type: String, default: null },
        refundStatus: {
          type: String,
          enum: ["Initiated", "Processing", "Completed"],
          default: null,
        },
      },
    ],

    returnAndRefund: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
          required: true,
        },
        returnReason: {
          type: String,
          enum: [
            "Size too small",
            "Size too big",
            "Don't like the fit",
            "Don't like the quality",
            "Not same as the catalogue",
            "Product is damaged",
            "Wrong product is received",
            "Product arrived too late",
          ],
        },
        specificReturnReason: {
          type: String,
        },
        requestDate: { type: Date, default: null },
        pickupLocationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "UserAddress",
          default: null,
        },
        returnAndRefundTransactionId: { type: String, default: null },
        bankDetails: {
          accountNumber: { type: String },
          ifscCode: { type: String },
          branchName: { type: String },
          accountName: { type: String },
        },
        refundStatus: {
          type: String,
          enum: ["Initiated", "Processing", "Completed"],
          default: null,
        },
      },
    ],

    exchange: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
          required: true,
        },
        requestDate: { type: Date, default: null },
        exchangeReason: {
          type: String,
          enum: [
            "Size too small",
            "Size too big",
            "Don't like the fit",
            "Don't like the quality",
            "Not same as the catalogue",
            "Product is damaged",
            "Wrong product is received",
            "Product arrived too late",
          ],
        },
        exchangeSpecificReason: { type: String },
        color: { type: String },
        size: { type: String },
        skuId: { type: String },
        isSizeAvailability: {
          type: Boolean,
        },
        pickupLocationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "UserAddress",
          default: null,
        },
        exchangeStatus: {
          type: String,
          enum: ["Initiated", "Processing", "Completed"],
          default: null,
        },
      },
    ],

    deliveryDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserOrder", orderSchema);
