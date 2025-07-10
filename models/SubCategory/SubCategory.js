const mongoose = require("mongoose");

const subCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    required: true,
  },
  description: {
    type: String,
    trim: true,
  },
  image: {
    type: String,
  },
  isTrendy:{type:Boolean,default:false},
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true, // Every subcategory belongs to one category
  },
});

module.exports = mongoose.model("SubCategory", subCategorySchema);