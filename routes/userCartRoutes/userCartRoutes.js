const express = require("express");
const router = express.Router();
const { verifyToken } = require("../../middlewares/verifyToken");
const { isUser } = require("../../middlewares/isUser");

// Import Cart Controllers
const {
  addToCart,
  removeItemFromCart,
  getUserCart,
  updateCartItemQuantity
} = require("../../controllers/userCartController/userCartController");


// Route to create item in User's cart
router.post("/create", verifyToken, isUser, addToCart);

// Route to Remove item in User's cart
router.delete(
  "/removeitem",
  verifyToken,
  isUser,
  removeItemFromCart
);

// Route to update item quantity in partner's cart
router.put("/update-quantity",verifyToken ,isUser, updateCartItemQuantity);

router.get("/", verifyToken, isUser, getUserCart);

module.exports = router;
