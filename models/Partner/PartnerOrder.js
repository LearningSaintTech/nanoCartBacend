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

    // Order Items
    itemDescription: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
          required: true,
        },
        color: {
          type: String,
        },
        size: {
          type: String,
        },
        skuId: {
          type: String,
        },
      },
    ],

    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
    },
    totalPrice: {
      type: Number,
    },

    // Shipping Information
    shippingAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PartnerAddress",
    },

    // Payment Information This is for online Payment
    paymentMethod: {
      type: String,
      enum: ["Online", "COD"],
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },
    razorpayOrderId: {
      type: String,
      // required: true,
      default: null,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      // required: true,
    },
    razorpaySignature: {
      type: String,
      default: null,
      // required: true,
    },

    isOrderPlaced: {
      type: Boolean,
      default: false,
    },
    // Order Status
    orderStatus: {
      type: String,
      enum: [
        "Confirmed",
        "Ready for Dispatch",
        "Dispatched",
        "Delivered",
        "Cancelled",
        "Returned",
        "Initiated",
      ],
    },

    // Refund
    refund: {
      isRefundActive: {
        type: Boolean,
        default: false,
      },
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
      refundTransactionId: { type: String },
      refundStatus: { type: String },
    },

    BankDetails: {
      accountNumber: {
        type: String,
      },
      ifscCode: {
        type: String,
      },
      branchName: {
        type: String,
      },
      accountName: {
        type: String,
      },
    },

    //Exchange
    exchange: {
      requestDate: { type: Date, default: null },
      status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending",
      },
      reason: {
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
      specificReason: {
        type: String,
      },
      isExchange: {
        type: Boolean,
      },

      isReturn: {
        type: Boolean,
      },
      newItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Item",
      },
      color: {
        type: String,
      },
      size: {
        type: String,
      },
      skuId: {
        type: String,
      },
    },

    deliveryDate: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PartnerOrder", orderSchema);
