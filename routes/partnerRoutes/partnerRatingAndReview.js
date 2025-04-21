const express = require("express");
const multer = require("multer");
const router = express.Router();
const {createReview,updateReview,deleteReview,getMyReviews,getAllRatingsAndReviews}=require("../../controllers/partnerController/partnerRatingReviewController")
 
// Configure Multer for handling file uploads
const storage = multer.memoryStorage();    
const upload = multer({ storage }); 

const {verifyToken}=require("../../middlewares/verifyToken");
const {isPartner}=require("../../middlewares/isPartner");


router.post("/create", verifyToken,isPartner, upload.single("customerImage"), createReview);
router.put("/:reviewId", verifyToken,isPartner, upload.single("customerImage"), updateReview); 
router.delete("/:reviewId", verifyToken, isPartner,  deleteReview);
router.get("/", getAllRatingsAndReviews);
router.get("/partner", getMyReviews);


module.exports=router