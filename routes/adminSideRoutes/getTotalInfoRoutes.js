const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/verifyToken');
const {isAdmin}=require("../../middlewares/isAdmin")
const {
  getTotalUsers,
  getTotalPartners,
  getTotalCategories,
  getTotalSubcategories,
  getTotalItems,
} = require('../../controllers/adminSideController/getTotalInfo');

// Route to get total count of Users
router.get('/users', verifyToken,isAdmin, getTotalUsers);

// Route to get total count of Partners
router.get('/partners', verifyToken, isAdmin, getTotalPartners);

// Route to get total count of Categories
router.get('/categories', verifyToken, isAdmin, getTotalCategories);

// Route to get total count of Subcategories
router.get('/subcategories', verifyToken, isAdmin, getTotalSubcategories);

// Route to get total count of Items
router.get('/items', verifyToken, isAdmin, getTotalItems);

module.exports = router;