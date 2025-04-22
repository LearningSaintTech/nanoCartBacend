const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
    },
    userId: {
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
      enum: ["Online", "COD", "Wallet"],
    },

    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      defualt:null
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

    exchange: {
      requestDate: { type: Date, default: null },
      status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending",
      },
      newItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ItemId",
      },
      color: {
        type: String,
      },
      size: {
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
