const express = require("express");
const router = express.Router();
const multer = require("multer");
const { partnerSignup,verifyPartner ,getPartnerProfiles} = require("../../controllers/partnerController/partnerAuthController");
const {isAdmin}=require("../../middlewares/isAdmin"); 
const { verifyToken } = require("../../middlewares/verifyToken");
const { isPartner } = require("../../middlewares/isPartner");

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage }); 

// Partner signup (B2C -> B2B transition)
router.post("/signup", upload.single("imageShop"), partnerSignup);

// Verify a partner 
router.post("/verify/:id",verifyToken,isAdmin, verifyPartner);


//partner Profile Routes
router.get("/profile",verifyToken,isPartner,getPartnerProfiles)

module.exports = router;
 