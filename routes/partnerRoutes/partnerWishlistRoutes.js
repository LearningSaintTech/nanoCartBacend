const express = require("express");
const router = express.Router();

// Import the required Controller
const {
  addToWishlist,
  removeItemFromWishlist,
  getPartnerWishlist,
  getPartnerWishlistForAdmin
} = require("../../controllers/partnerController/partnerWishlistController");
const {verifyToken}=require("../../middlewares/verifyToken")
const {isPartner}=require("../../middlewares/isPartner") 

const {isAdmin}=require("../../middlewares/isAdmin") 
// Route to add an item to the partner's wishlist
router.post("/create", verifyToken, isPartner,addToWishlist);

// Route to remove an item from the partner's wishlist 
router.put("/removeitem", verifyToken, isPartner, removeItemFromWishlist);

// Route to fetch the partner's wishlist
router.get("/", verifyToken, isPartner,getPartnerWishlist);


// Route to fetch the partner's wishlist
router.get("/admin/:partnerId", verifyToken, isAdmin,getPartnerWishlistForAdmin);


module.exports = router;