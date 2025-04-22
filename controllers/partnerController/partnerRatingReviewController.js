const PartnerRatingReview = require("../../models/Partner/PartnerRatingReview");
const Partner = require("../../models/Partner/Partner"); // Adjust path
const mongoose = require("mongoose");
const ItemDetail = require("../../models/Items/ItemDetail"); // Adjust path
const Item = require("../../models/Items/Item"); // Adjust path
const { uploadMultipleImagesToS3 } = require("../../utils/s3Upload"); // Adjust path
const { apiResponse } = require("../../utils/apiResponse"); // Adjust path

// Create a new rating and review
exports.createRatingReview = async (req, res) => {
  try {
    console.log("Starting createRatingReview");
    console.log("Request body:", req.body);

    let { rating, review, itemDetailId, sizeBought } = req.body;
    const { partnerId } = req.user;

    // Validate required fields
    if (!rating || !itemDetailId) {
      return res
        .status(400)
        .json(apiResponse(400, false, "rating and itemDetailId are required"));
    }

    if (!mongoose.Types.ObjectId.isValid(itemDetailId)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Invalid itemDetailId"));
    }

    rating = Number(rating);
    if (isNaN(rating) || rating < 0 || rating > 5) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Rating must be between 0 and 5"));
    }

    // Validate user
    const partnerExists = await Partner.exists({ _id: partnerId });
    if (!partnerExists) {
      return res.status(404).json(apiResponse(404, false, "Partner not found"));
    }

    // Validate itemDetail
    const itemDetail = await ItemDetail.findById(itemDetailId);
    if (!itemDetail) {
      return res
        .status(404)
        .json(apiResponse(404, false, "ItemDetail not found"));
    }

    if (!itemDetail.itemId) {
      return res
        .status(400)
        .json(apiResponse(400, false, "ItemDetail has no associated Item"));
    }

    // Check if review already exists
    const existingReview = await PartnerRatingReview.findOne({
      partnerId,
      itemDetailId,
    });
    if (existingReview) {
      return res
        .status(400)
        .json(apiResponse(400, false, "partner has already reviewed this item"));
    }

    // Create review instance
    const newRatingReview = new PartnerRatingReview({
      partnerId,
      itemDetailId,
      rating,
      review,
      sizeBought,
    });

    // Upload images to S3 if present
    let uploadedImages = [];
    if (req.files && req.files.length > 0) {
      console.log("111111111")
      const folder = `Nanocart/partner/${partnerId}/ratingsReviews/${newRatingReview._id}/customerImages`;
      uploadedImages = await uploadMultipleImagesToS3(req.files, folder);
      newRatingReview.customerProductImage = uploadedImages;
      console.log("222222222222222")
    }

    // Save the new review
    await newRatingReview.save();

    // Update Item's average rating
    const allRatings = await PartnerRatingReview.find({ itemDetailId })
      .select("rating")
      .lean();
    const totalRatingSum = allRatings.reduce(
      (acc, curr) => acc + curr.rating,
      0
    );
    const averageRating =
      allRatings.length > 0
        ? parseFloat((totalRatingSum / allRatings.length).toFixed(2))
        : 0;

    await Item.findByIdAndUpdate(itemDetail.itemId, {
      partnerAverageRating: averageRating,
    });

    return res.status(201).json(
      apiResponse(201, true, "Review created successfully", {
        review: newRatingReview,
        averageRating,
      })
    );
  } catch (error) {
    console.error("Error in createRatingReview:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });
    return res
      .status(error.statusCode || 500)
      .json(apiResponse(error.statusCode || 500, false, error.message));
  }
};

exports.deleteRatingReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { partnerId } = req.user;

    // Validate reviewId
    if (!reviewId) {
      return res
        .status(400)
        .json(apiResponse(400, false, "reviewId is required"));
    }

    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid reviewId"));
    }

    // Fetch review
    const existingReview = await PartnerRatingReview.findById(reviewId);
    if (!existingReview) {
      return res.status(404).json(apiResponse(404, false, "Review not found"));
    }

    // Authorization check
    if (existingReview.partnerId.toString() !== partnerId.toString()) {
      return res
        .status(403)
        .json(
          apiResponse(
            403,
            false,
            "You are not authorized to delete this review"
          )
        );
    }

    // Get related itemDetailId and itemId before deletion
    const { itemDetailId } = existingReview;
    const itemDetail = await ItemDetail.findById(itemDetailId);
    if (!itemDetail || !itemDetail.itemId) {
      return res
        .status(400)
        .json(apiResponse(400, false, "ItemDetail or Item not found"));
    }

    const itemId = itemDetail.itemId;

    // Delete review
    await PartnerRatingReview.findByIdAndDelete(reviewId);

    // Recalculate average rating for the item
    const remainingReviews = await PartnerRatingReview.find({ itemDetailId })
      .select("rating")
      .lean();
    const totalRatings = remainingReviews.reduce(
      (acc, curr) => acc + curr.rating,
      0
    );
    const averageRating =
      remainingReviews.length > 0
        ? parseFloat((totalRatings / remainingReviews.length).toFixed(2))
        : 0;

    await Item.findByIdAndUpdate(itemId, { partnerAverageRating: averageRating });

    return res
      .status(200)
      .json(
        apiResponse(200, true, "Review deleted successfully", { averageRating })
      );
  } catch (error) {
    console.error("Error in deleteRatingReview:", {
      message: error.message,
      stack: error.stack,
      params: req.params,
    });
    return res
      .status(error.statusCode || 500)
      .json(apiResponse(error.statusCode || 500, false, error.message));
  }
};

exports.getRatingsAndReviewsByItemDetailId = async (req, res) => {
  try {
    const { itemDetailId } = req.params;

    if (!itemDetailId) {
      return res
        .status(400)
        .json(apiResponse(400, false, "itemDetailId is required in params"));
    }

    const reviews = await PartnerRatingReview.find({ itemDetailId })
      .populate("partnerId", "name") // Get user's name
      .sort({ createdAt: -1 }); // Latest first

    if (!reviews || reviews.length === 0) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Reviews not found for this itemDetail"));
    }

    // Extract customer images
    const arrayOfCustomerImage = reviews
      .flatMap((review) => review.customerProductImage)
      .filter((img) => img && img.trim() !== "");

    // Rating metrics
    const totalRating = reviews.length;
    const totalReview = reviews.filter(
      (review) => review.review && review.review.trim() !== ""
    ).length;

    const averageRating = (
      reviews.reduce((acc, cur) => acc + cur.rating, 0) / totalRating
    ).toFixed(1);

    return res.status(200).json(
      apiResponse(200, true, "Ratings & reviews fetched successfully", {
        count: reviews.length,
        data: reviews,
        arrayOfCustomerImage,
        totalRating,
        totalReview,
        averageRating,
      })
    );
  } catch (error) {
    console.error("Error fetching reviews:", error.message);
    return res.status(500).json(
      apiResponse(500, false, "Internal server error", {
        error: error.message,
      })
    );
  }
};
