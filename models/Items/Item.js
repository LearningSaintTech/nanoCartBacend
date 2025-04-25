const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    description: { type: String },
    MRP: { type: Number, required: true, min: 0 },
    totalStock: { type: Number, required: true, default: 0, min: 0 },
    image: { type: String, required: true },
    discountedPrice: { type: Number, min: 0 },
    discountPercentage: { type: Number, default: 0 },
    defaultColor:{
      type:String
    },
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
    userAverageRating: {
      type: Number,
    },
    partnerAverageRating: {
      type: Number,
    },
  },
  { timestamps: true }
);

itemSchema.pre("save", function (next) {
  if (this.discountedPrice && this.MRP) {
    this.discountPercentage = ((this.MRP - this.discountedPrice) / this.MRP) * 100;
  }
  next();
});

module.exports = mongoose.model("Item", itemSchema);