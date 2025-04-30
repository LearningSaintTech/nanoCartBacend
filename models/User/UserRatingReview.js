const mongoose = require("mongoose");

const UserRatingReviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: [true, "itemDetailId is required"],
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [0, "Rating must be at least 0"],
      max: [5, "Rating must be at most 5"],
    },
    review: {
      type: String,
      trim: true,
    },
    customerProductImage: [
      {
        type: String,
        default: "",
      },
    ],
    sizeBought:{
      type:String,
    }
  },
  {
    timestamps: true,
  }
);



module.exports = mongoose.model("UserRatingReview", UserRatingReviewSchema);
