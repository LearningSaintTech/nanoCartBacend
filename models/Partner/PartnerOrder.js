const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
      index: true,
    },
    orderProductDetails: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
          required: [true, "itemId is required"],
        },
        orderDetails: [
          {
            color: {
              type: String,
            },
            sizeAndQuantity: [
              {
                size: {
                  type: String,
                  trim: true,
                  lowercase: true,
                },
                quantity: {
                  type: Number,
                  default: 1,
                  min: [1, "Quantity must be at least 1"],
                },
                skuId: {
                  type: String,
                  required: [true, "skuId is required"],
                  trim: true,
                },
              },
            ],
          },
        ],
        totalQuantity: {
          type: Number,
          default: 1,
          min: [1, "Quantity must be at least 1"],
        },
        totalPrice: {
          type: Number,
          default: 1,
          min: [1, "Price must be at least 1"],
        },
        addedAt: {
          type: Date,
          default: Date.now,
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
      ref: "PartnerAddress",
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
      ],
      default: "In transit",
    },
    isOrderPlaced: { type: Boolean, default: false },
    isOrderReturned: { type: Boolean, default: false },
    razorpayOrderId: { type: String, default: null, index: true },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
    isOnlinePayment: {
      type: Boolean,
      default: false,
    },
    onlineAmount: {
      type: Number,
      default: 0,
    },
    isCodPayment: {
      type: Boolean,
      default: false,
    },
    codAmount: {
      type: Number,
      default: 0,
    },
    isChequePayment: {
      type: Boolean,
      default: false,
    },
    chequeAmount: {
      type: Number,
      default: 0,
    },
    isWalletPayment: {
      type: Boolean,
      default: false,
    },
    walletAmountUsed: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    chequeImages: {
      url: {
        type: String,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },
    returnInfo: {
      reason: { type: String },
      requestDate: { type: Date, default: null },
      pickupLocationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PartnerAddress",
        default: null,
      },
      refundTransactionId: { type: String, default: null },
      refundAmount: {
        type: Number,
        min: 0,
        default: null,
      },
      refundStatus: {
        type: String,
        enum: ["Initiated", "Processing", "Completed"],
        default: null,
      },
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PartnerOrder", orderSchema);