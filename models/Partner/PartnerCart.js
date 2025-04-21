const mongoose = require("mongoose");

const PartnerCartSchema = new mongoose.Schema(
  {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
      unique: true,
    },
    items: [
      {
        itemDetailId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ItemDetail",
          required: true,
        },
        color: {
          type: String,
          required: true,
        },
        size: {
          type: String,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
          default: 1,
        },
        skuId: {
          type: String,
          required: true,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("PartnerCart", PartnerCartSchema);
