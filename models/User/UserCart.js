const mongoose = require("mongoose");
const { Schema } = mongoose;

const cartSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      unique: true,
    },
    items: [
      {
        itemId: {
          type: Schema.Types.ObjectId,
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

const UserCart = mongoose.model("UserCart", cartSchema);

module.exports = UserCart;
