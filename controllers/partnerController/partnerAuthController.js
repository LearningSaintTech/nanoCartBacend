require("dotenv").config();
const jwt = require("jsonwebtoken");
const Partner = require("../../models/Partner/Partner");
const PartnerProfile = require("../../models/Partner/PartnerProfile");
const User = require("../../models/User/User");
const Wallet=require("../../models/Partner/PartnerWallet")
const { uploadImageToS3 } = require("../../utils/s3Upload");
const { apiResponse } = require("../../utils/apiResponse");


exports.partnerSignup = async (req, res) => {
  let partner = null;

  try {
    const {
      name,
      phoneNumber,
      email,
      shopName,
      gstNumber,
      shopAddress,
      panNumber,
      pincode,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !phoneNumber ||
      !email ||
      !shopName ||
      !gstNumber ||
      !panNumber ||
      !shopAddress ||
      !pincode
    ) {
      return res
        .status(400)
        .json(apiResponse(400, false, "All required fields must be provided"));
    }

    if (!req.file) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Shop image is required"));
    }

    // Check if user exists
    const existingUser = await User.findOne({ phoneNumber });
    if (!existingUser) {
      return res
        .status(404)
        .json(apiResponse(404, false, "User not found. Sign up as a user first."));
    }

    // Check if partner already exists
    const existingPartner = await Partner.findOne({ phoneNumber });
    if (existingPartner) {
      return res
        .status(403)
        .json(apiResponse(403, false, "Partner already exists. Please log in."));
    }

    // Create partner
    partner = await Partner.create({
      name,
      email,
      phoneNumber,
      isPhoneVerified: true,
      isVerified: false,
      isActive: false,
      partner: existingUser._id,
    });

    // Create partner profile
    await PartnerProfile.create({
      shopName,
      gstNumber,
      shopAddress,
      panNumber,
      pincode,
      partnerId: partner._id,
    });

    // Upload shop image
    if (req.file) {
      const imageShopUrl = await uploadImageToS3(
        req.file,
        `Nanocart/partner/${partner._id}/imageshop`
      );
      partner.imageShop = imageShopUrl;
    }

    partner.isProfile = true;
    await partner.save();

    return res.status(200).json(
      apiResponse(
        200,
        true,
        "Partner signup successful. Awaiting admin verification.",
        partner
      )
    );
  } catch (error) {
    // Delete partner if it was created and any error occurred later
    if (partner?._id) {
      await Partner.findByIdAndDelete(partner._id);
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      const message = `${duplicateField.charAt(0).toUpperCase() + duplicateField.slice(1)} already exists.`;
      return res.status(409).json(apiResponse(409, false, message));
    }

    console.error("Signup Error:", error.message);
    return res.status(500).json(apiResponse(500, false, "Internal server error"));
  }
};

exports.verifyPartner = async (req, res) => {
  let wallet = null;
  try {
    const { id } = req.params;
    const partner = await Partner.findById(id);
    if (!partner) {
      return res.status(404).json(apiResponse(404, false, "Partner not found"));
    }
    if (partner.isVerified) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Partner already verified"));
    }

    // Verify and activate partner
    partner.isVerified = true;
    partner.isActive = true;
    await partner.save();

    const user = await User.findOne({ phoneNumber: partner.phoneNumber });
    if (!user) {
      throw new Error("Associated user not found");
    }
    user.isActive = false;
    user.isPartner = true;
    user.role = "Partner";
    await user.save();

    // Create wallet for the partner
    wallet = await Wallet.create({
      partnerId: partner._id,
      totalBalance: 0,
      currency: "INR",
      isActive: true, // Set to true since partner is verified
    });

    // Update partner to indicate wallet creation
    partner.isWalletCreated = true;
    await partner.save();

    const payload = {
      partnerId: partner._id,
      role: "Partner",
      phoneNumber: partner.phoneNumber,
      email: partner.email,
      name: partner.name,
    };
    // Generate JWT token
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    // Send token in header
    res.setHeader("Authorization", `Bearer ${token}`);
    return res
      .status(200)
      .json(apiResponse(200, true, "Partner verified successfully",token));
  } catch (error) {
    // Delete wallet if it was created
    if (wallet?._id) {
      await Wallet.findByIdAndDelete(wallet._id);
      // Ensure isWalletCreated is not left as true
      if (partner && partner.isWalletCreated) {
        partner.isWalletCreated = false;
        await partner.save();
      }
    }
    console.error("Verification Error:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};