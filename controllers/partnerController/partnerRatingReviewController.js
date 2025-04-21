const PartnerRatingAndReview = require("../../models/Partner/PartnerRatingReview");
const { uploadImageToS3 } = require("../../utils/s3Upload");
const ItemDetail = require("../../models/Items/ItemDetail");
const apiResponse = require("../../utils/apiResponse"); // Assuming you use a common response formatter

exports.createReview = async (req, res) => {
  try {
    const { rating, comment, itemDetailId } = req.body;
    const { partnerId } = req.user;

    if (!rating) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Rating is required"));
    }

    if (!itemDetailId) {
      return res
        .status(400)
        .json(apiResponse(400, false, "ItemDetail ID is required"));
    }

    // Prepare new review object
    const newReview = {
      rating: parseFloat(rating),
      comment: comment?.trim() || "",
    };

    // Find or create partnerRatingAndReview document
    let ratingDoc = await PartnerRatingAndReview.findOne({ partnerId });

    if (!ratingDoc) {
      ratingDoc = new PartnerRatingAndReview({
        partnerId,
        reviews: [newReview],
      });
    } else {
      ratingDoc.reviews.push(newReview);
    }

    // Optional Image Upload
    if (req.file) {
      const fileName = req.file.originalname;
      const ratingReviewId = ratingDoc._id || new mongoose.Types.ObjectId();
      const folderPath = `patner/${partnerId}/ratingReview/${ratingReviewId}/customerImage/${fileName}`;

      const s3ImageUrl = await uploadImageToS3(req.file, folderPath);
      ratingDoc.customerPhoto = s3ImageUrl;
    }

    // Save the rating document
    await ratingDoc.save();

    // Update the ItemDetail document by pushing the ratingDoc._id into partnerRatingAndReviews
    await ItemDetail.findByIdAndUpdate(
      itemDetailId,
      { $push: { partnerRatingAndReviews: ratingDoc._id } },
      { new: true }
    );

    return res
      .status(201)
      .json(apiResponse(201, true, "Review created successfully", ratingDoc));
  } catch (error) {
    console.error("Error creating review:", error);
    return res
      .status(500)
      .json(apiResponse(500, false, "Internal Server Error", error.message));
  }
};

exports.getAllCustomerImages = async (req, res) => {
  try {
    const reviews = await PartnerRatingAndReview.find(
      { customerPhoto: { $ne: "" } }, // Only include if image exists
      { customerPhoto: 1, userId: 1 } // Only fetch necessary fields
    );
    return res
      .status(200)
      .json(
        apiResponse(200, true, "Customer Image Fetch Successfully", reviews)
      );
  } catch (error) {
    console.error("Error fetching customer images:", error.message);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching customer images",
    });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const { partnerId } = req.user;

    const ratingDoc = await PartnerRatingAndReview.findOne({ partnerId });
    if (!ratingDoc) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Review document not found"));
    }

     // Handle optional image update
        if (req.file) {
          const fileName = req.file.originalname;
          const ratingReviewId = ratingDoc._id.toString();
          const folderPath = `partner/${partnerId}/ratingReview/${ratingReviewId}/customerImage/${fileName}`;
    
          const newImageLink = await updateFromS3(ratingDoc.customerPhoto, folderPath, req.file);
          ratingDoc.customerPhoto = newImageLink;
        }

    const review = ratingDoc.reviews.id(reviewId);
    if (!review) {
      return res.status(404).json(apiResponse(404, false, "Review not found"));
    }

    review.rating = rating !== undefined ? parseFloat(rating) : review.rating;
    review.comment = comment !== undefined ? comment.trim() : review.comment;

    await ratingDoc.save();

    return res
      .status(200)
      .json(apiResponse(200, true, "Review updated", ratingDoc));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error updating review", error.message));
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { partnerId } = req.user;

    const ratingDoc = await PartnerRatingAndReview.findOne({ partnerId });
    if (!ratingDoc) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Review document not found"));
    }

    const review = ratingDoc.reviews.id(reviewId);
    if (!review) {
      return res.status(404).json(apiResponse(404, false, "Review not found"));
    }

    review.remove();
    await ratingDoc.save();

    return res
      .status(200)
      .json(apiResponse(200, true, "Review deleted", ratingDoc));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error deleting review", error.message));
  }
};

exports.getMyReviews = async (req, res) => {
  try {
    const { partnerId } = req.user;

    const ratingDoc = await PartnerRatingAndReview.findOne({ partnerId });
    if (!ratingDoc) {
      return res.status(404).json(apiResponse(404, false, "No review found"));
    }

    return res
      .status(200)
      .json(apiResponse(200, true, "Fetched successfully", ratingDoc));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error fetching review", error.message));
  }
};

// Utility to calculate averageRating, totalRating, totalReview
const calculateStats = (reviews) => {
  const ratingCount = reviews.filter(
    (r) => typeof r.rating === "number"
  ).length;
  const ratingSum = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
  const reviewCount = reviews.filter(
    (r) => r.comment && r.comment.trim() !== ""
  ).length;

  const averageRating = ratingCount > 0 ? ratingSum / ratingCount : 0;

  return {
    averageRating: parseFloat(averageRating.toFixed(2)),
    totalRating: ratingCount,
    totalReview: reviewCount,
  };
};

exports.getAllRatingsAndReviews = async (req, res) => {
  try {
    const allDocs = await PartnerRatingAndReview.find();

    if (allDocs.length === 0) {
      return res
        .status(404)
        .json(apiResponse(404, false, "No ratings and reviews found"));
    }

    const result = allDocs.map((doc) => {
      const stats = calculateStats(doc.reviews);
      return {
        ...doc.toObject(),
        ...stats,
      };
    });

    return res
      .status(200)
      .json(apiResponse(200, true, "Fetched all ratings and reviews", result));
  } catch (error) {
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          false,
          "Error fetching ratings and reviews",
          error.message
        )
      );
  }
};
