const User = require("../../models/User/User");
const Item = require("../../models/Items/Item");
const Category = require("../../models/Category/Category");
const Partner = require("../../models/Partner/Partner");
const SubCategory = require("../../models/SubCategory/SubCategory");
const { apiResponse } = require("../../utils/apiResponse");

// Controller to get total count of Users
exports.getTotalUsers = async (req, res) => {
  try {
    // Count all users
    const totalUsers = await User.countDocuments({});

    // Send successful response
    return res
      .status(200)
      .json(
        apiResponse(200, true, "Total Users retrieved successfully", {
          totalUsers,
        })
      );
  } catch (error) {
    // Handle errors (e.g., database connection issues)
    console.error("Error fetching total users:", error);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          false,
          "An error occurred while fetching total users",
          { error: error.message }
        )
      );
  }
};

// Controller to get total count of Partners
exports.getTotalPartners = async (req, res) => {
  try {
    // Count all partners
    const totalPartners = await Partner.countDocuments({});

    // Send successful response
    return res
      .status(200)
      .json(
        apiResponse(200, true, "Total Partners retrieved successfully", {
          totalPartners,
        })
      );
  } catch (error) {
    // Handle errors (e.g., database connection issues)
    console.error("Error fetching total partners:", error);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          false,
          "An error occurred while fetching total partners",
          { error: error.message }
        )
      );
  }
};

// Controller to get total count of Categories
exports.getTotalCategories = async (req, res) => {
  try {
    // Count all categories
    const totalCategories = await Category.countDocuments({});

    // Send successful response
    return res
      .status(200)
      .json(
        apiResponse(200, true, "Total Categories retrieved successfully", {
          totalCategories,
        })
      );
  } catch (error) {
    // Handle errors (e.g., database connection issues)
    console.error("Error fetching total categories:", error);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          false,
          "An error occurred while fetching total categories",
          { error: error.message }
        )
      );
  }
};

// Controller to get total count of Subcategories
exports.getTotalSubcategories = async (req, res) => {
  try {
    // Count all subcategories
    const totalSubcategories = await SubCategory.countDocuments({});

    // Send successful response
    return res
      .status(200)
      .json(
        apiResponse(200, true, "Total Subcategories retrieved successfully", {
          totalSubcategories,
        })
      );
  } catch (error) {
    // Handle errors (e.g., database connection issues)
    console.error("Error fetching total subcategories:", error);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          false,
          "An error occurred while fetching total subcategories",
          { error: error.message }
        )
      );
  }
};

// Controller to get total count of Items
exports.getTotalItems = async (req, res) => {
  try {
    // Count all items
    const totalItems = await Item.countDocuments({});

    // Send successful response
    return res
      .status(200)
      .json(
        apiResponse(200, true, "Total Items retrieved successfully", {
          totalItems,
        })
      );
  } catch (error) {
    // Handle errors (e.g., database connection issues)
    console.error("Error fetching total items:", error);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          false,
          "An error occurred while fetching total items",
          { error: error.message }
        )
      );
  }
};
