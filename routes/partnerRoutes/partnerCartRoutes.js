const express = require("express");
const router = express.Router();

// Import the required Controller
const {
  addToCart,
  removeItemFromCart,
  getPartnerCart,
  getPartnerCartByAdmin,
  updateItemQuantityBySizeAction
} = require("../../controllers/partnerController/partnerCartController");

const { verifyToken } = require("../../middlewares/verifyToken");
const { isPartner } = require("../../middlewares/isPartner");
const { isAdmin } = require("../../middlewares/isAdmin");

// Route to add an item to the partner's cart
router.post("/create", verifyToken, isPartner, addToCart);

// Route to update item quantity in the partner's cart
router.patch("/update-quantity", verifyToken, isPartner, updateItemQuantityBySizeAction);

// Route to remove an item from the partner's cart
router.delete("/removeitem", verifyToken, isPartner, removeItemFromCart);

// Route to fetch the partner's cart
router.get("/", verifyToken, isPartner, getPartnerCart);

// Route to fetch the partner's cart by admin
router.get("/admin/:partnerId", verifyToken, isAdmin, getPartnerCartByAdmin);

module.exports = router;