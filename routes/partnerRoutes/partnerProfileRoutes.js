const express=require("express")
const router=express.Router();
const {verifyToken}=require("../../middlewares/verifyToken");
const {isPartner}=require("../../middlewares/isPartner")
const {updatePartnerProfile,getPartnerProfile}=require("../../controllers/partnerController/partnerProfileController")

//Not mandatory
// router.put("/", verifyToken, isPartner, updatePartnerProfile); 

router.get("/",verifyToken,isPartner,getPartnerProfile)

module.exports=router;  