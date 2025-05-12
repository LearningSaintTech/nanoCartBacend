const express = require('express');
const router = express.Router();
const multer = require('multer');
const {generateTBYBImage}=require("../../controllers/userTBYBController/userTBYBController")
const {verifyToken}=require("../../middlewares/verifyToken")
const {isUser}=require("../../middlewares/isUser")

// Configure multer for file uploads
// Configure Multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });


// Route to generate TBYB image
router.post(
  '/generate',
  verifyToken,
  isUser,
  upload.single('userImage'),
  generateTBYBImage
);

module.exports = router;