const User = require("../../models/User/User.js");
const PhoneOTP = require("../../models/OTP/PhoneOTP.js");
const Partner = require("../../models/Partner/Partner");
const { apiResponse } = require("../../utils/apiResponse");
const jwt = require("jsonwebtoken");
require("dotenv").config();

exports.sendPhoneOtp = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || !/^\d{10}$/.test(phoneNumber)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Valid 10-digit phone number required"));
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // TODO: Implement SMS sending logic
    // await sendSMS(phoneNumber, `Your OTP is ${otp}`);

    const phoneNumberExist = await PhoneOTP.findOne({ phoneNumber });
    if (!phoneNumberExist) {
      await PhoneOTP.create({ phoneNumber, otp });
    } else {
      phoneNumberExist.otp = otp;
      await phoneNumberExist.save();
    }
    return res.status(200).json(apiResponse(200, true, "OTP sent", { otp }));
  } catch (error) {
    console.log("Error in sendOtp:", error.message);
    return res.status(500).json(apiResponse(500, false, "Failed to send OTP"));
  }
};

exports.phoneOtpVerification = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    if (!phoneNumber || !otp) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Phone number and OTP are required"));
    }
    const dbOtpEntry = await PhoneOTP.findOne({ phoneNumber });
    if (!dbOtpEntry) {
      return res
        .status(404)
        .json(
          apiResponse(404, false, "OTP not found. Please request a new one.")
        );
    }
    if (dbOtpEntry.expiresAt < new Date()) {
      return res.status(410).json(apiResponse(410, false, "OTP has expired"));
    }
    if (dbOtpEntry.otp !== otp) {
      return res.status(401).json(apiResponse(401, false, "Invalid OTP"));
    }
    dbOtpEntry.isVerified = true;
    await dbOtpEntry.save();
    return res
      .status(200)
      .json(apiResponse(200, true, "Phone verified successfully"));
  } catch (error) {
    console.error("Error in otpVerification:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

//user Signup
exports.signup = async (req, res) => {
  try {
    const { name, phoneNumber, email } = req.body;
    if (!name || !phoneNumber || !email) {
      return res
        .status(400)
        .json(
          apiResponse(400, false, "Name, phone number, and email are required")
        );
    }
    const existingUser = await User.findOne({
      $or: [{ phoneNumber }, { email }],
    });
    if (existingUser) {
      return res
        .status(403)
        .json(apiResponse(403, false, "User already exists. Please log in"));
    }
    const phoneDetails = await PhoneOTP.findOne({ phoneNumber });
    if (!phoneDetails || !phoneDetails.isVerified) {
      return res
        .status(403)
        .json(apiResponse(403, false, "Please verify your phone number first"));
    }
    // Create user
    const user = await User.create({
      name,
      phoneNumber,
      email,
      isPhoneVerified: true,
      isActive: true,
      role: "User",
      isPartner: false,
    });

    // Generate JWT token
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET not configured");
    const payload = {
      userId: user._id,
      role: user.role,
      phoneNumber: user.phoneNumber,
      email: user.email,
      name: user.name,
    };
    console.log("payload-> ", payload);
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    // Delete OTP
    await PhoneOTP.findOneAndDelete({ phoneNumber });

    // Set token in header
    res.setHeader("Authorization", `Bearer ${token}`);

    return res
      .status(200)
      .json(apiResponse(200, true, "User signed up successfully", { token }));
  } catch (error) {
    console.error("Signup Error:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

exports.login = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    // Validate input
    if (!phoneNumber || !otp) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Phone number and OTP are required"));
    }

    // Find user in User model
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res
        .status(404)
        .json(
          apiResponse(404, false, "User not found please be first signup ")
        );
    }
    
    // Verify OTP
    const phoneOTP = await PhoneOTP.findOne({ phoneNumber });
    if (!phoneOTP) {
      return res.status(404).json(apiResponse(404, false, "OTP not found"));
    }
    if (phoneOTP.expiresAt < new Date()) {
      return res.status(410).json(apiResponse(410, false, "OTP has expired"));
    }
    if (phoneOTP.otp !== otp) {
      return res.status(401).json(apiResponse(401, false, "Invalid OTP"));
    }

    // Delete OTP
    await PhoneOTP.findOneAndDelete({ phoneNumber });

    // Check phone verification
    if (!user.isPhoneVerified) {
      return res
        .status(403)
        .json(apiResponse(403, false, "Phone number is not verified"));
    }

    // Ensure JWT_SECRET is configured
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET not configured");

    let token;
    // Admin Flow:
    if (user.role === "Admin") {
      const adminPayload = {
        adminId: user._id,
        adminPhoneNumber: user.phoneNumber,
        email: user.email,
        name: user.name,
        role: user.role,
      };
      console.log(adminPayload);
      token = jwt.sign(adminPayload, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });
      res.setHeader("Authorization", `Bearer ${token}`);
      return res
        .status(200)
        .json(apiResponse(200, true, "User logged in successfully", { token }));
    }

    // Partner Flow:
    if (user.isPartner === true && user.isActive === false) {
      const partner = await Partner.findOne({ phone: phoneNumber });
      if (!partner) {
        return res
          .status(404)
          .json(apiResponse(404, false, "Partner record not found"));
      }
      if (!partner.isVerified) {
        return res
          .status(403)
          .json(apiResponse(403, false, "Partner is not verified"));
      }
      if (!partner.isActive) {
        return res
          .status(403)
          .json(apiResponse(403, false, "Partner account is inactive"));
      }

      // Generate token for partner
      const partnerPayload = {
        partnerId: partner._id,
        phoneNumber: partner.phone,
        email: partner.email,
        name: partner.name,
        role: "Partner",
        isActive: partner.isActive,
      };
      console.log(partnerPayload);
      token = jwt.sign(partnerPayload, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });
      res.setHeader("Authorization", `Bearer ${token}`);
      await PhoneOTP.findOneAndDelete({ phoneNumber });
      return res
        .status(200)
        .json(
          apiResponse(200, true, "Partner logged in successfully", { token })
        );
    }

    // Normal User Flow: If isPartner is false (before verification)
    else {
      if (!user.isActive) {
        return res
          .status(403)
          .json(apiResponse(403, false, "User account is inactive"));
      }

      // Generate token for normal user
      const userPayload = {
        userId: user._id,
        phoneNumber: user.phoneNumber,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      };
      console.log(userPayload);
      token = jwt.sign(userPayload, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });
      res.setHeader("Authorization", `Bearer ${token}`);
      await PhoneOTP.findOneAndDelete({ phoneNumber });
      return res
        .status(200)
        .json(apiResponse(200, true, "User logged in successfully", { token }));
    }
  } catch (error) {
    console.log("Login Error:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};


exports.getUserProfile = async (req, res) => {
  try {
    const { userId } = req.user;

    // Select only name, email, and phoneNumber
    const user = await User.findById(userId).select("name email phoneNumber");

    if (!user) {
      return res.status(400).json(apiResponse(400, false, "User not Found"));
    }

    const data = {
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
    };

    return res
      .status(200)
      .json(apiResponse(200, true, "User profile fetched successfully", data));

  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, error.message));
  }
};
