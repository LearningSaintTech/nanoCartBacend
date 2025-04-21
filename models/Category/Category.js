const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name: {
    type: String, 
    trim: true,
    required: true, // Category name is mandatory
  },
  description: {
    type: String,
    trim: true,
  },
  image: {
    type: String,
  },
});

module.exports = mongoose.model("Category", categorySchema);