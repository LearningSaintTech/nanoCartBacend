const mongoose = require("mongoose");

const PartnerWishlistSchema = new mongoose.Schema(
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
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("PartnerWishlist", PartnerWishlistSchema);