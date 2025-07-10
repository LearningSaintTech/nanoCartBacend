const express = require("express");
const router = express.Router();
const { verifyToken } = require("../../middlewares/verifyToken");
const { isUser } = require("../../middlewares/isUser");
const { isAdmin } = require("../../middlewares/isAdmin");

// Import Cart Controllers
const {
  addToCart,
  removeItemFromCart,
  getUserCart,
  getUserCartByAdmin,
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


router.get("/admin/:userId", verifyToken, isAdmin, getUserCartByAdmin);

module.exports = router;
