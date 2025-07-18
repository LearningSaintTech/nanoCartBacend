// // Import the required modules
// const express = require("express");
// const router = express.Router();
// const {verifyToken}=require("../../middlewares/verifyToken");
// const {isUser}=require("../../middlewares/isUser");

// // Import the required controllers and middleware functions
// const {
//   sendPhoneOtp, 
//   phoneOtpVerification,
//   signup,
//   login,
//   getUserProfile,
//   updateUserProfile,
//   deleteUserAccount
// } = require("../../controllers/userAuthControllers/UserAuthController");


// // Route for sendPhoneOtp
// router.post("/otp", sendPhoneOtp);

// // Route for phoneOtpVerification 
// router.post("/otp/verify", phoneOtpVerification);

// // Route for user signup
// router.post("/signup", signup);

// // Route for user login
// router.post("/login", login);

// //Route for user profile
// router.get("/profile",verifyToken,isUser,getUserProfile)

// //Route for user profile
// router.put("/profile",verifyToken,isUser,updateUserProfile)

// //routes for user delete
// router.delete("/",verifyToken,isUser,deleteUserAccount)

// // Export the router for use in the main application
// module.exports = router;


// routes/userAuthRoutes/UserAuthRoutes.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../../middlewares/verifyToken");
const { isUser } = require("../../middlewares/isUser");

// Import the required controllers
const {
  signup,
  login,
  getUserProfile,
  updateUserProfile,
  deleteUserAccount,
  sendPhoneOtp,
  login1,
  phoneOtpVerification,
  signup1
} = require("../../controllers/userAuthControllers/UserAuthController");

// Route for user signup
router.post("/signup", signup);

// Route for user login
router.post("/login", login);

// Route for user profile (protected)
router.get("/profile", verifyToken, isUser, getUserProfile);

// Route for updating user profile (protected)
router.put("/profile", verifyToken, isUser, updateUserProfile);

// Route for deleting user account (protected)
router.delete("/", verifyToken, isUser, deleteUserAccount);


// Route for sendPhoneOtp
router.post("/otp", sendPhoneOtp);
// Route for user login
router.post("/login1", login1);
// Route for phoneOtpVerification 
router.post("/otp/verify", phoneOtpVerification);
// Route for user signup
router.post("/signup1", signup1);

// Export the router
module.exports = router;