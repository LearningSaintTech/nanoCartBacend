// Import the required modules
const express = require("express");
const router = express.Router();
const {verifyToken}=require("../../middlewares/verifyToken");
const {isUser}=require("../../middlewares/isUser");

// Import the required controllers and middleware functions
const {
  sendPhoneOtp, 
  phoneOtpVerification,
  signup,
  login,
  getUserProfile,
  updateUserProfile,
} = require("../../controllers/userAuthControllers/UserAuthController");


// Route for sendPhoneOtp
router.post("/otp", sendPhoneOtp);

// Route for phoneOtpVerification 
router.post("/otp/verify", phoneOtpVerification);

// Route for user signup
router.post("/signup", signup);

// Route for user login
router.post("/login", login);

//Route for user profile
router.get("/profile",verifyToken,isUser,getUserProfile)

//Route for user profile
router.put("/profile",verifyToken,isUser,updateUserProfile)

// Export the router for use in the main application
module.exports = router;
