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
          required: [true, "itemId is required"],
        },
        quantity: {
          type: Number,
          default: 1,
          min: [1, "Quantity must be at least 1"],
        },
        size: {
          type: String,
          required: [true, "size is required"],
          trim: true,
        },
        color: {
          type: String,
          required: [true, "color is required"],
          trim: true,
        },
        skuId: {
          type: String,
          required: [true, "skuId is required"],
          trim: true,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        isReturn: { type: Boolean, default: false },
        isExchange: { type: Boolean, default: false },

        returnInfo: {
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
          specificReturnReason: { type: String },
          requestDate: { type: Date, default: null },
          pickupLocationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserAddress",
            default: null,
          },
          returnAndRefundTransactionId: { type: String, default: null },
          bankDetails: {
            accountHolderName: { type: String },
            accountNumber: { type: String },
            ifscCode: { type: String },
            bankName: { type: String }, 
          },
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

        exchangeInfo: {
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
          isSizeAvailability: { type: Boolean },
          requestDate: { type: Date, default: null },
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
      ],
      default: "Initiated",
    },
    isOrderPlaced: { type: Boolean, default: false },
    isOrderCancelled: { type: Boolean, default: false },
    totalAmount: {
      type: Number,
      required: true,
    },

    refund: {
      refundReason: { type: String },
      requestDate: { type: Date, default: null },
      refundAmount: {
        type: Number,
        min: 0,
        default: null,
      },
      refundRazorpayTransactionId: { type: String, default: null },
      refundStatus: {
        type: String,
        enum: ["Initiated", "Processing", "Completed"],
        default: null,
      },
    },

    deliveryDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserOrder", orderSchema);
