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
    
    paymentMethod:{
      
    }
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
    isOrderReturned: { type: Boolean, default: false },
   
    deliveredAt: {
      type: Date,
      default: Date.now(),
    },

    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },

    walletMoneyUsed:{
      type:Number,
      default:0
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    checkImages: 
        {
          url: {
            type: String,
            required: true,
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
      returnAndRefundTransactionId: { type: String, default: null },
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("PartnerOrder", orderSchema);
