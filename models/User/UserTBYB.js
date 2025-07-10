const mongoose = require("mongoose");

const TBYBSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  images: [
    {
      itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Item",
        required: true,
      },
      tbybImageUrl:{type:[String]}
    },
  ],
});

module.exports = mongoose.model("UserTBYB", TBYBSchema);
