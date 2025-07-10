const express = require('express');
const router = express.Router();
const { generatePositiveFakeReviewsForItem, deleteFakeReviewsForItem,getAllFakeRatingsForItem } = require("../../controllers/fakeDataController/fakeReviewRatingController");
const { verifyToken } = require("../../middlewares/verifyToken");
const { isAdmin } = require("../../middlewares/isAdmin");

// Route to generate positive fake reviews
router.post('/generate-positive-fake-reviews', verifyToken, isAdmin, generatePositiveFakeReviewsForItem);

// Route to delete fake reviews for an item
router.delete('/delete-fake-reviews', verifyToken, isAdmin, deleteFakeReviewsForItem);

//Route to get fake rating and review for an item
router.get("/all-rating",verifyToken, isAdmin,getAllFakeRatingsForItem);

module.exports = router;