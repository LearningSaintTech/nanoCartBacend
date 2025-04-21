const Partner = require("../../models/Partner/Partner"); 
const PartnerProfile = require("../../models/Partner/PartnerProfile"); 
const User = require("../../models/User/User"); 
const { uploadImageToS3 } = require("../../utils/s3Upload");
const jwt = require("jsonwebtoken");
require("dotenv").config();


exports.partnerSignup = async (req, res) => {
  try {
    const { name, phoneNumber, email, shopName, gstNumber, shopAddress, panNumber, pincode } = req.body;

    // Validate required fields
    if (!name || !phoneNumber || !email || !shopName || !panNumber || !shopAddress || !pincode) {
      return res.status(400).json(apiResponse(400, false, "All required fields must be provided"));
    }
    if (!req.file) {
      return res.status(400).json(apiResponse(400, false, "Shop image is required"));
    }

    // Check if user exists and deactivate them
    const existingUser = await User.findOne({ phoneNumber });
    if (!existingUser) {
      return res.status(404).json(apiResponse(404, false, "User not found. Sign up as a user first."));
    }
    
    // Check if partner already exists
    const existingPartner = await Partner.findOne({ phoneNumber });
    if (existingPartner) {
      return res.status(403).json(apiResponse(403, false, "Partner already exists. Please log in"));
    }

    // Create partner (pending admin verification)
    const partner = await Partner.create({
      name,
      email,
      phoneNumber,
      isPhoneVerified: true,
      isVerified: false, // Admin must verify
      isActive: false,   // Inactive until verified
      userId: existingUser._id,
    });

    // Create partner profile
    const partnerProfile = await PartnerProfile.create({
      shopName,
      gstNumber, 
      shopAddress,
      panNumber,
      pincode,
      partnerId: partner._id,
    });

    // Upload shop image to S3
    const imageShopUrl = await uploadImageToS3(req.file, `partner/${partner._id}`);
    partner.imageShop = imageShopUrl;
    partner.isProfile = true;
    await partner.save();

    return res.status(200).json(apiResponse(200, true, "Partner signup successful. Awaiting admin verification."));
  } catch (error) {
    console.error("Signup Error:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};



exports.verifyPartner = async (req, res) => {
  try {
    const { partnerId } = req.params; 
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json(apiResponse(404, false, "Partner not found"));
    }
    if (partner.isVerified) {
      return res.status(400).json(apiResponse(400, false, "Partner already verified"));
    }

    // Verify and activate partner
    partner.isVerified = true;
    partner.isActive = true;
    await partner.save();


    const user=await User.findOne({phoneNumber:partner.phoneNumber});
    user.isActive=false;
    user.isPartner=true;
    user.role="Partner"
    await user.save(); 

    const payload = {
        partnerId: partner._id,
        role:"Partner",
        phoneNumber: partner.phoneNumber,
        email: partner.email,
        name: partner.name,
      };
    // Generate JWT token
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "24h" });

    // Send token in header
    res.setHeader("Authorization", `Bearer ${token}`);
    return res.status(200).json(apiResponse(200, true, "Partner verified successfully"));
  } catch (error) {
    console.error("Verification Error:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};