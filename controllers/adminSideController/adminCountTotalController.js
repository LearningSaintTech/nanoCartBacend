const mongoose = require("mongoose");
const User = require("../../models/User/User");
const Partner = require("../../models/Partner/Partner");
const Item = require("../../models/Items/Item");
const Category = require("../../models/Category/Category");
const SubCategory = require("../../models/SubCategory/SubCategory");
const { apiResponse } = require("../../utils/apiResponse");

// 1) Total Users
exports.getAllUsers = async (req, res) => {
  console.log("[GET ALL USERS] Request received");
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log("📦 Fetching Users...");
    const users = await User.find({ role: "User" })
      .select("name phoneNumber email isPhoneVerified isEmailVerified isActive isAddress")
      .skip(skip)
      .limit(limit)
      .lean();

    const totalUsers = await User.countDocuments({ role: "User" });

    console.log("🔢 Total Users:", totalUsers);
    return res.status(200).json(apiResponse(200, true, "Users retrieved successfully", { users, totalUsers, page, limit }));
  } catch (error) {
    console.error("[GET ALL USERS] Error:", error);
    return res.status(500).json(apiResponse(500, false, "An error occurred while fetching users", { error: error.message }));
  }
};

// Get All Partners
exports.getAllPartners = async (req, res) => {
  console.log("[GET ALL PARTNERS] Request received");
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log("🚚 Fetching Partners...");
    const partners = await Partner.find({})
      .select("name phoneNumber email isVerified isPhoneVerified isEmailVerified isActive isProfile isWalletCreated isAddress imageShop")
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPartners = await Partner.countDocuments({});

    console.log("🔢 Total Partners:", totalPartners);
    return res.status(200).json(apiResponse(200, true, "Partners retrieved successfully", { partners, totalPartners, page, limit }));
  } catch (error) {
    console.error("[GET ALL PARTNERS] Error:", error);
    return res.status(500).json(apiResponse(500, false, "An error occurred while fetching partners", { error: error.message }));
  }
};
exports.getTotalUsers = async (req, res) => {
  console.log("[GET TOTAL USERS] Request received");
  try {
    const totalUsers = await User.countDocuments({ role: "User" });
    console.log("[GET TOTAL USERS] Total:", totalUsers);
    return res.status(200).json(apiResponse(200, true, "Total Users retrieved successfully", { totalUsers }));
  } catch (error) {
    console.error("[GET TOTAL USERS] Error:", error);
    return res.status(500).json(apiResponse(500, false, "An error occurred while fetching total users", { error: error.message }));
  }
};

// 1) Total Partners
exports.getTotalPartners = async (req, res) => {
  console.log("[GET TOTAL PARTNERS] Request received");
  try {
    const totalPartners = await Partner.countDocuments({});
    console.log("[GET TOTAL PARTNERS] Total:", totalPartners);
    return res.status(200).json(apiResponse(200, true, "Total Partners retrieved successfully", { totalPartners }));
  } catch (error) {
    console.error("[GET TOTAL PARTNERS] Error:", error);
    return res.status(500).json(apiResponse(500, false, "An error occurred while fetching total partners", { error: error.message }));
  }
};

// 1) Total Categories
exports.getTotalCategories = async (req, res) => {
  console.log("[GET TOTAL CATEGORIES] Request received");
  try {
    const totalCategories = await Category.countDocuments({});
    console.log("[GET TOTAL CATEGORIES] Total:", totalCategories);
    return res.status(200).json(apiResponse(200, true, "Total Categories retrieved successfully", { totalCategories }));
  } catch (error) {
    console.error("[GET TOTAL CATEGORIES] Error:", error);
    return res.status(500).json(apiResponse(500, false, "An error occurred while fetching total categories", { error: error.message }));
  }
};

// 1) Total Subcategories
exports.getTotalSubcategories = async (req, res) => {
  console.log("[GET TOTAL SUBCATEGORIES] Request received");
  try {
    const totalSubcategories = await SubCategory.countDocuments({});
    console.log("[GET TOTAL SUBCATEGORIES] Total:", totalSubcategories);
    return res.status(200).json(apiResponse(200, true, "Total Subcategories retrieved successfully", { totalSubcategories }));
  } catch (error) {
    console.error("[GET TOTAL SUBCATEGORIES] Error:", error);
    return res.status(500).json(apiResponse(500, false, "An error occurred while fetching total subcategories", { error: error.message }));
  }
};

// 1) Total Items
exports.getTotalItems = async (req, res) => {
  console.log("[GET TOTAL ITEMS] Request received");
  try {
    const totalItems = await Item.countDocuments({});
    console.log("[GET TOTAL ITEMS] Total:", totalItems);
    return res.status(200).json(apiResponse(200, true, "Total Items retrieved successfully", { totalItems }));
  } catch (error) {
    console.error("[GET TOTAL ITEMS] Error:", error);
    return res.status(500).json(apiResponse(500, false, "An error occurred while fetching total items", { error: error.message }));
  }
};

