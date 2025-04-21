const express = require("express");
const router = express.Router();

// Import the required Controller
const {
  addToWishlist,
  removeItemFromWishlist,
  getUserWishlist,
} = require("../../controllers/userWishlistController/userWishlistController");

const { verifyToken } = require("../../middlewares/verifyToken");
const { isUser } = require("../../middlewares/isUser");

// Route to add an item to the wishlist
router.post("/create", verifyToken, isUser, addToWishlist);

// Route to remove an item from the wishlist
router.put("/remove", verifyToken, isUser, removeItemFromWishlist);

// Route to fetch the user's wishlist
router.get("/", verifyToken, isUser, getUserWishlist);



module.exports = router;
