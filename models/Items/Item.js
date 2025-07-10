const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    description: { type: String },
    MRP: { type: Number, required: true, min: 0 },
    totalStock: { type: Number, required: true, default: 0, min: 0 },
    isOutOfStock: { type: Boolean, default: false },
    image: { type: String },
    itemImageId: { type: String },
    discountedPrice: { type: Number, min: 0 },
    discountPercentage: { type: Number, default: 0 },
    defaultColor: { type: String },
    isItemDetail: { type: Boolean, default: false },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
      required: true,
    },
    filters: [
      {
        key: { type: String },
        value: { type: String },
      },
    ],
    userAverageRating: { type: Number,default:0 }
  },
  { timestamps: true }
);

// Add text index on name and description fields for full-text search
itemSchema.index({ name: "text", description: "text" });

itemSchema.post("save", function (next) {
  // Calculate discountPercentage if discountedPrice and MRP are provided
  if (this.discountedPrice && this.MRP) {
    this.discountPercentage = ((this.MRP - this.discountedPrice) / this.MRP) * 100;
  } else {
    this.discountPercentage = 0; // Ensure discountPercentage is set to 0 if not applicable
  }

  // Set isOutOfStock based on totalStock
  this.isOutOfStock = this.totalStock === 0;
});

module.exports = mongoose.model("Item", itemSchema);