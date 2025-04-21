const express = require("express");
const router = express.Router();

// Import the required Controller
const {
  addToCart,
  removeFromCart,
  getPartnerCart,
  deleteCart,
  updateCartItemQuantity,
} = require("../../controllers/partnerController/partnerCartController");

const { verifyToken } = require("../../middlewares/verifyToken");
const { isPartner } = require("../../middlewares/isPartner");

// Route to add an item to the partner's cart
router.post("/create", verifyToken, isPartner, addToCart);

// Route to remove an item from the partner's cart
router.delete("/removeitem", verifyToken, isPartner, removeFromCart);

// Route to fetch the partner's cartG
router.get("/", verifyToken, isPartner, getPartnerCart);

// Route to update item quantity in partner's cart
router.put("/update-quantity",verifyToken ,isPartner, updateCartItemQuantity);

module.exports = router;