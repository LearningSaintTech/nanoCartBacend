const express=require("express")
const router=express.Router();
const {verifyToken}=require("../../middlewares/verifyToken");
const {isPartner}=require("../../middlewares/isPartner")
const {updatePartnerProfile}=require("../../controllers/partnerController/partnerProfileController")


router.put("/", verifyToken, isPartner, updatePartnerProfile); 

module.exports=router;