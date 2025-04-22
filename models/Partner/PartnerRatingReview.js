const mongoose = require("mongoose");

const RatingAndReviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: [true, "PartnerId is required"],
    },
    itemDetailId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ItemDetail",
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
    sizeBought: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one review per user per item
RatingAndReviewSchema.index({ userId: 1, itemDetailId: 1 }, { unique: true });

module.exports = mongoose.model(
  "PartnerRatingAndReview",
  RatingAndReviewSchema
);
