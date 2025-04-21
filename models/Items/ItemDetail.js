const mongoose = require("mongoose");

const itemDetailSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },
    imagesByColor: [ 
      {
        color: { type: String },
        images: [
          {
            url: { type: String }, // Image or video URL from S3
            priority: { type: Number }, // Used for sorting display order
          },
        ],
        sizes: [
          {
            size: { type: String, trim: true },
            stock: { type: Number, default: 0 },
            skuId: { type: String, required: true },
          },
        ],
      },
    ],
    sizeChart: [
      {
        size: { type: String, trim: true },
        inches: { type: Map, of: Number },
        cm: { type: Map, of: Number },
      },
    ],
    howToMeasure: [{ type: Map, of: String }],
    isSize: { type: Boolean, default: false },
    isMultipleColor: { type: Boolean, default: false },
    deliveryDescription: { type: String },
    About: { type: String, trim: true },
    PPQ: [
      {
        minQty: { type: Number, required: true },
        maxQty: { type: Number },
        pricePerUnit: { type: Number, required: true },
      },
    ],
    deliveryPincode: [{ type: Number }],
    returnPolicy: {
      type: String,
      default: "30-day return policy available.",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ItemDetail", itemDetailSchema);