const express = require("express");
const router = express.Router();
const {
  getWalletDetails,
} = require("../../controllers/partnerController/partnerWalletController");
const {verifyToken} = require("../../middlewares/verifyToken"); 
const {isPartner} = require("../../middlewares/isPartner"); 


// Get partner's wallet details (INR)
router.get("/", verifyToken,isPartner, getWalletDetails);


module.exports = router;