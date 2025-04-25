const mongoose = require("mongoose");
const { Schema } = mongoose;

const cartSchema = new Schema(
  {
    partnerId: {
      type: Schema.Types.ObjectId,
      ref: "Partner",
      required: [true, "partnerId is required"],
      unique: true,
    },
    items: [
      {
        itemId: {
          type: Schema.Types.ObjectId,
          ref: "Item",
          required: [true, "itemId is required"],
        },
        colors: [
          {
            color:{
              type:String
            },
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
        totalQuantity: {
          type: Number,
          default: 1,
          min: [1, "Quantity must be at least 1"],
        },
        totalPrice: {
          type: Number,
          default: 1,
          min: [1, "Quantity must be at least 1"],
        },

        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying of cart items
cartSchema.index({
  "items.itemId": 1,
  "items.color": 1,
  "items.size": 1,
  "items.skuId": 1,
});

module.exports = mongoose.model("PartnerCart", cartSchema);
