// routes/partnerRoutes/partnerAuthRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { partnerSignup,partnerSignup1, verifyPartner, getPartnerProfiles } = require("../../controllers/partnerController/partnerAuthController");
const { isAdmin } = require("../../middlewares/isAdmin");
const { verifyToken } = require("../../middlewares/verifyToken");
const { isPartner } = require("../../middlewares/isPartner");

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Partner signup (B2C -> B2B transition)
router.post("/signup", upload.single("imageShop"), partnerSignup);

// Partner signup (B2C -> B2B transition)
router.post("/signup1", upload.single("imageShop"), partnerSignup1);

// Verify a partner (admin only)
router.post("/verify/:id", verifyToken, isAdmin, verifyPartner);

// Partner profile (protected)
router.get("/profile", verifyToken, isPartner, getPartnerProfiles);

// Export the router
module.exports = router;