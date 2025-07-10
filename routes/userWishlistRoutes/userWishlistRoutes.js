const express = require("express");
const router = express.Router();

// Import the required Controller
const {
  addToWishlist,
  removeItemFromWishlist,
  getUserWishlist,
  getUserWishlistByAdmin
} = require("../../controllers/userWishlistController/userWishlistController");

const { verifyToken } = require("../../middlewares/verifyToken");
const { isUser } = require("../../middlewares/isUser");
const { isAdmin } = require("../../middlewares/isAdmin");

// Route to add an item to the wishlist
router.post("/create", verifyToken, isUser, addToWishlist);

// Route to remove an item from the wishlist
router.put("/remove", verifyToken, isUser, removeItemFromWishlist);

// Route to fetch the user's wishlist
router.get("/", verifyToken, isUser, getUserWishlist);

// Route to fetch the user's wishlist
router.get("/admin/:userId", verifyToken, isAdmin, getUserWishlistByAdmin);

module.exports = router;
