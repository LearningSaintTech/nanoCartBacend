const User = require('../../models/User/User');
const Partner = require('../../models/Partner/Partner');
const Category = require('../../models/Category/Category');
const SubCategory = require('../../models/SubCategory/SubCategory');
const Item = require('../../models/Items/Item');
const { apiResponse } = require('../../utils/apiResponse');

// Controller to get total counts of Users, Partners, Categories, Subcategories, and Items
exports.getTotals = async (req, res) => {
  try {
    // Use Promise.all to run all count queries concurrently for better performance
    const [totalUsers, totalPartners, totalCategories, totalSubcategories, totalItems] = await Promise.all([
      User.countDocuments({}), // Count all users
      Partner.countDocuments({}), // Count all partners
      Category.countDocuments({}), // Count all categories
      SubCategory.countDocuments({}), // Count all subcategories
      Item.countDocuments({}), // Count all items
    ]);

    // Construct response
    const response = {
      totalUsers,
      totalPartners,
      totalCategories,
      totalSubcategories,
      totalItems,
    };

    // Send successful response
    res.status(200).json(apiResponse(200,true,"Data Retrived",response));
  } catch (error) {
    // Handle errors (e.g., database connection issues)
    console.error('Error fetching totals:', error);
    res.status(500).json({
      error: 'An error occurred while fetching totals',
      details: error.message,
    });
  }
};


