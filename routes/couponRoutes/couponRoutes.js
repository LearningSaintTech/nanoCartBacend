const express = require('express');
const router = express.Router();
const { createCoupon, applyCouponByPartner, applyCouponByUser,updateCoupon, deleteCoupon,getAllCoupons } = require('../../controllers/couponController/couponController'); // Adjusted path to couponController
const { isUser } = require('../../middlewares/isUser');
const {isPartner}=require("../../middlewares/isPartner")
const { isAdmin } = require('../../middlewares/isAdmin');
const { verifyToken } = require('../../middlewares/verifyToken');

// Create a new coupon (Admin only)
router.post('/create', verifyToken, isAdmin, createCoupon);

// Apply a coupon to a purchase amount (User only)
router.post('/apply-partner', verifyToken,isPartner, applyCouponByPartner);

// Apply a coupon to a purchase amount (User only)
router.post('/apply-user', verifyToken,isUser, applyCouponByUser);

// Update a coupon by couponCode (Admin only)
router.put('/update', verifyToken, isAdmin, updateCoupon);

// Delete a coupon by couponCode (Admin only)
router.delete('/delete', verifyToken, isAdmin, deleteCoupon);

//Get All coupon 
router.get("/",verifyToken,isAdmin,getAllCoupons)

module.exports = router;