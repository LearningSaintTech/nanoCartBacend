const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/verifyToken.js');
const { isAdmin } = require('../../middlewares/isAdmin.js');
const {
  getTotalUsers,
  getTotalPartners,
  getTotalCategories,
  getTotalSubcategories,
  getTotalItems,
  getAllUsers,
  getAllPartners,
  
} = require('../../controllers/adminSideController/adminCountTotalController.js');



// Route to get total count of Users
router.get('/users/total', verifyToken, isAdmin, getTotalUsers);

// Route to get total count of Partners
router.get('/partners/total', verifyToken, isAdmin, getTotalPartners);

// Route to get total count of Categories
router.get('/categories/total', verifyToken, isAdmin, getTotalCategories);

// Route to get total count of Subcategories
router.get('/subcategories/total', verifyToken, isAdmin, getTotalSubcategories);

// Route to get total count of Items
router.get('/items/total', verifyToken, isAdmin, getTotalItems);

// Route to get all users
router.get('/users', verifyToken, isAdmin, getAllUsers);

// Route to get all partners
router.get('/partners', verifyToken, isAdmin, getAllPartners);




module.exports = router;