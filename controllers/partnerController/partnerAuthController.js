// routes/partnerRoutes/partnerAuthRoutes.js
const mongoose = require("mongoose");
const Partner = require("../../models/Partner/Partner");
const PartnerProfile = require("../../models/Partner/PartnerProfile");
const User = require("../../models/User/User");
const Wallet = require("../../models/Partner/PartnerWallet");
const { uploadImageToS3 } = require("../../utils/s3Upload");
const { apiResponse } = require("../../utils/apiResponse");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");

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
      idToken,
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
      !pincode ||
      !idToken
    ) {
      return res
        .status(400)
        .json(apiResponse(400, false, "All required fields and ID token must be provided"));
    }

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
      if (decodedToken.phone_number !== phoneNumber) {
        return res
          .status(401)
          .json(apiResponse(401, false, "Phone number does not match ID token"));
      }
    } catch (error) {
      console.error("Firebase token verification error:", error.message);
      return res.status(401).json(apiResponse(401, false, "Invalid or expired ID token"));
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
      firebaseUid: decodedToken.uid,
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
    if (partner?._id) {
      await Partner.findByIdAndDelete(partner._id);
    }
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      const message = `${duplicateField.charAt(0).toUpperCase() + duplicateField.slice(1)} already exists.`;
      return res.status(409).json(apiResponse(409, false, message));
    }
    console.error("Signup Error:", error.message);
    return res.status(500).json(apiResponse(500, false, "Internal server error"));
  }
};

exports.partnerSignup1 = async (req, res) => {
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
        .json(apiResponse(400, false, "All required fields and ID token must be provided"));
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
    if (partner?._id) {
      await Partner.findByIdAndDelete(partner._id);
    }
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
      isActive: true,
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
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.setHeader("Authorization", `Bearer ${token}`);
    return res
      .status(200)
      .json(apiResponse(200, true, "Partner verified successfully", { token }));
  } catch (error) {
    if (wallet?._id) {
      await Wallet.findByIdAndDelete(wallet._id);
      if (partner && partner.isWalletCreated) {
        partner.isWalletCreated = false;
        await partner.save();
      }
    }
    console.error("Verification Error:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

exports.getPartnerProfiles = async (req, res) => {
  try {
    const { partnerId } = req.user;

    if (!partnerId) {
      return res.status(400).json(apiResponse(400, false, "partnerId is required"));
    }
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid partnerId format"));
    }

    const profile = await PartnerProfile.findOne({ partnerId })
      .populate({
        path: "partnerId",
        select: "name phoneNumber email",
      })
      .lean();

    if (!profile) {
      return res.status(404).json(apiResponse(404, false, "PartnerProfile not found"));
    }

    return res
      .status(200)
      .json(apiResponse(200, true, "PartnerProfile fetched successfully", profile));
  } catch (error) {
    console.error("Error fetching partner profile:", error.message);
    return res.status(500).json(apiResponse(500, false, "An error occurred while fetching partner profile"));
  }
};