
const mongoose=require("mongoose") 
const { faker } = require('@faker-js/faker');
const User = require('../../models/User/User');
const Item = require('../../models/Items/Item');
const UserRatingReview = require('../../models/User/UserRatingReview');
const { apiResponse } = require('../../utils/apiResponse');

// Helper: Generate a positive review
function generatePositiveReview() {
  const positiveReviews = [
    "Absolutely love this product!",
    "Exceeded my expectations.",
    "Great value for the price.",
    "Very comfortable and stylish.",
    "Would definitely buy again.",
    "The quality is top-notch.",
    "Looks exactly like the picture.",
    "Fast delivery and amazing quality!",
    "Fits perfectly and looks great!",
    "Amazing experience overall!",
  ];
  return faker.helpers.arrayElement(positiveReviews);
}


exports.generatePositiveFakeReviewsForItem = async (req, res) => {
  try {
    const { count, itemId: itemIdStr } = req.body;

    if (!count || typeof count !== 'number' || count <= 0) {
      return res.status(400).json(apiResponse(400, false, 'Invalid count'));
    }

    if (!mongoose.Types.ObjectId.isValid(itemIdStr)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid itemId'));
    }

    const itemId = new mongoose.Types.ObjectId(itemIdStr); // Convert to ObjectId
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json(apiResponse(404, false, 'Item not found'));
    }

    const fakeUsers = await User.find({ isFakeUser: true }, '_id');
    if (fakeUsers.length === 0) {
      return res.status(400).json(apiResponse(400, false, 'No fake users available'));
    }

    // Get users who haven't reviewed the item
    const existingReviews = await UserRatingReview.find({ itemId }).select('userId').lean();
    const existingUserIds = new Set(existingReviews.map(review => review.userId.toString()));

    const availableFakeUsers = fakeUsers.filter(user => !existingUserIds.has(user._id.toString()));


    // Check if enough unique fake users are available
    if (availableFakeUsers.length < count) {
      return res.status(400).json(
        apiResponse(400, false, `Not enough fake users available. Add more fake users. Required: ${count}, Available: ${availableFakeUsers.length}`)
      );
    }

    const reviews = [];
    // Shuffle and select 'count' unique users
    const selectedUsers = faker.helpers.shuffle(availableFakeUsers).slice(0, count);

    for (const user of selectedUsers) {
      const rating = faker.number.float({ min: 4.0, max: 5.0, precision: 0.5 });

      reviews.push({
        userId: user._id,
        itemId: item._id,
        isFakeRatingReview: true,
        rating,
        review: generatePositiveReview(),
        sizeBought: faker.helpers.arrayElement(['S', 'M', 'L', 'XL']),
      });
    }

    if (reviews.length === 0) {
      return res.status(400).json(apiResponse(400, false, 'No reviews could be generated'));
    }

    const userRating = await UserRatingReview.insertMany(reviews);

    // Update Item's average rating
    const allRatings = await UserRatingReview.find({ itemId }).select('rating').lean();
    const totalRatingSum = allRatings.reduce((acc, curr) => acc + curr.rating, 0);
    const averageRating = allRatings.length > 0
      ? parseFloat((totalRatingSum / allRatings.length).toFixed(2))
      : 0;

    await Item.findByIdAndUpdate(itemId, {
      userAverageRating: averageRating,
    });

    // Include all ratings in the response
    const ratingsList = allRatings.map(rating => rating.rating);

    return res.status(201).json(
      apiResponse(201, true, `${reviews.length} positive fake reviews created`, {
        itemId: itemIdStr,
        averageRating,
        userRating, // Inserted reviews
        ratings: ratingsList, // All ratings for the item
      })
    );
  } catch (error) {
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};




exports.deleteFakeReviewsForItem = async (req, res) => {
  try {
    const { itemId } = req.body;

    // Validate itemId
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid itemId'));
    }

    const itemObjectId = new mongoose.Types.ObjectId(itemId);

    // Check if item exists
    const item = await Item.findById(itemObjectId);
    if (!item) {
      return res.status(404).json(apiResponse(404, false, 'Item not found'));
    }

    // Delete fake reviews for the item
    const deleteResult = await UserRatingReview.deleteMany({
      itemId: itemObjectId,
      isFakeRatingReview: true,
    });

    // Update item's average rating based on remaining non-fake reviews
    const remainingRatings = await UserRatingReview.find({
      itemId: itemObjectId,
      isFakeRatingReview: false,
    }).select('rating').lean();

    const totalRatingSum = remainingRatings.reduce((acc, curr) => acc + curr.rating, 0);
    const averageRating = remainingRatings.length > 0
      ? parseFloat((totalRatingSum / remainingRatings.length).toFixed(2))
      : 0;

    await Item.findByIdAndUpdate(itemObjectId, {
      userAverageRating: averageRating,
    });

    return res.status(200).json(
      apiResponse(200, true, `${deleteResult.deletedCount} fake reviews deleted`, {
        itemId,
        deletedCount: deleteResult.deletedCount,
        newAverageRating: averageRating,
      })
    );
  } catch (error) {
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};


// GET: Retrieve all fake ratings for an item by itemId
exports.getAllFakeRatingsForItem = async (req, res) => {
  try {
    const { itemId } = req.body; // Using query parameter for GET request

    // Validate itemId
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid itemId'));
    }

    const itemObjectId = new mongoose.Types.ObjectId(itemId);

    // Check if item exists
    const item = await Item.findById(itemObjectId);
    if (!item) {
      return res.status(404).json(apiResponse(404, false, 'Item not found'));
    }

    // Fetch all fake reviews for the item
    const fakeReviews = await UserRatingReview.find({
      itemId: itemObjectId,
      isFakeRatingReview: true,
    })
      .select('userId rating review sizeBought createdAt')
      .populate('userId', 'name email')
      .lean();

    if (fakeReviews.length === 0) {
      return res.status(200).json(
        apiResponse(200, true, 'No fake reviews found for this item', {
          itemId,
          count: 0,
          fakeReviews: [],
        })
      );
    }

    return res.status(200).json(
      apiResponse(200, true, `${fakeReviews.length} fake reviews retrieved`, {
        itemId,
        count: fakeReviews.length,
        fakeReviews,
      })
    );
  } catch (error) {
    console.error('Get fake ratings error:', error);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};