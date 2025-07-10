const mongoose = require('mongoose');
const Coupon = require('../../models/Coupon/Coupon'); // Adjust path to your Coupon model
const { apiResponse } = require('../../utils/apiResponse'); // Adjust path to your apiResponse utility
exports.createCoupon = async (req, res) => {
  try {
    const {
      couponCode,
      discountType,
      discountValue,
      minimumPurchase,
      expirationDate,
      isActive = true,
    } = req.body;

    // Validate required fields
    if (!couponCode || !discountType || discountValue === undefined || !expirationDate) {
      return res.status(400).json(apiResponse(400, false, 'Missing required fields: couponCode, discountType, discountValue, and expirationDate are required'));
    }

    // Validate discountType
    if (!['Percentage', 'Flat'].includes(discountType)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid discount type. Must be "Percentage" or "Flat"'));
    }

    // Validate discountValue
    if (discountType === 'Percentage' && (discountValue > 100 || discountValue <= 0)) {
      return res.status(400).json(apiResponse(400, false, 'Percentage discount must be between 0 and 100'));
    }
    if (discountType === 'Flat' && discountValue <= 0) {
      return res.status(400).json(apiResponse(400, false, 'Flat discount must be greater than 0'));
    }

    // Validate minimumPurchase
    if (minimumPurchase && minimumPurchase < 0) {
      return res.status(400).json(apiResponse(400, false, 'Minimum purchase cannot be negative'));
    }

    // Validate expiration date
    const expiration = new Date(expirationDate);
    if (isNaN(expiration.getTime()) || expiration <= new Date()) {
      return res.status(400).json(apiResponse(400, false, 'Expiration date must be a valid date in the future'));
    }

    // Check if couponCode already exists
    const existingCoupon = await Coupon.findOne({ couponCode: couponCode.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json(apiResponse(400, false, 'Coupon code already exists'));
    }
    console.log("11111111111111");
    const coupon = new Coupon({
      couponCode: couponCode.toUpperCase(),
      discountType,
      discountValue,
      minimumPurchase: minimumPurchase || 0,
      expirationDate: expiration,
      isActive,
    });

    await coupon.save();

    return res.status(201).json(apiResponse(201, true, 'Coupon created successfully', coupon));
  } catch (error) {
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

// Apply coupon and fetch discount value
exports.applyCouponByPartner = async (req, res) => {
  try {
    // Step 1: Extract input
    const { couponCode } = req.body;
    const { partnerId } = req.user; 

    // Step 2: Validate input
    if (!couponCode || typeof couponCode !== 'string' || couponCode.trim() === '') {
      return res.status(400).json(apiResponse(400, false, 'Coupon code is required'));
    }
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid partner ID'));
    }

    // Step 3: Find coupon
    const coupon = await Coupon.findOne({
      couponCode: couponCode.toUpperCase(),
      isActive: true,
    });

    // Step 4: Validate coupon existence
    if (!coupon) {
      return res.status(404).json(apiResponse(404, false, 'Coupon not found or inactive'));
    }

    // Step 5: Check user usage
    const partnerObjectId = new mongoose.Types.ObjectId(partnerId);
    if (coupon.couponUserIdUsed.some(id => id.equals(partnerObjectId))) {
      return res.status(400).json(apiResponse(400, false, 'Coupon already used by Partner'));
    }

    // Step 6: Check expiration
    if (new Date(coupon.expirationDate) < new Date()) {
      return res.status(400).json(apiResponse(400, false, 'Coupon has expired'));
    }

    // Step 7: Fetch discount value
    const { discountValue, discountType } = coupon;

    // Step 8: Update coupon with user ID
    coupon.couponUserIdUsed.push(partnerObjectId);
    await coupon.save();

    // Step 9: Return response
    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Coupon applied successfully',
      data: {
        couponCode,
        discountType,
        discountValue,
      },
    });
  } catch (error) {
    // Step 10: Handle errors
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};
// Apply coupon and fetch discount value
exports.applyCouponByUser = async (req, res) => {
  try {
    // Step 1: Extract input
    const { couponCode } = req.body;
    const { userId } = req.user; 

    // Step 2: Validate input
    if (!couponCode || typeof couponCode !== 'string' || couponCode.trim() === '') {
      return res.status(400).json(apiResponse(400, false, 'Coupon code is required'));
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid User ID'));
    }

    // Step 3: Find coupon
    const coupon = await Coupon.findOne({
      couponCode: couponCode.toUpperCase(),
      isActive: true,
    });

    // Step 4: Validate coupon existence
    if (!coupon) {
      return res.status(404).json(apiResponse(404, false, 'Coupon not found or inactive'));
    }

    // Step 5: Check user usage
    const userObjectId = new mongoose.Types.ObjectId(userId);
    if (coupon.couponUserIdUsed.some(id => id.equals(userObjectId))) {
      return res.status(400).json(apiResponse(400, false, 'Coupon already used by User'));
    }

    // Step 6: Check expiration
    if (new Date(coupon.expirationDate) < new Date()) {
      return res.status(400).json(apiResponse(400, false, 'Coupon has expired'));
    }

    // Step 7: Fetch discount value
    const { discountValue, discountType } = coupon;

    // Step 8: Update coupon with user ID
    coupon.couponUserIdUsed.push(userObjectId);
    await coupon.save();

    // Step 9: Return response
    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Coupon applied successfully',
      data: {
        couponCode,
        discountType,
        discountValue,
      },
    });
  } catch (error) {
    // Step 10: Handle errors
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

// Update a coupon by couponCode
exports.updateCoupon = async (req, res) => {
  try {
    // Step 1: Extract input
    const { couponCode, discountType, discountValue, minimumPurchase, expirationDate, isActive } = req.body;

    // Step 2: Validate input
    if (!couponCode) {
      return res.status(400).json(apiResponse(400, false, 'Coupon code is required'));
    }

    // Step 3: Find coupon
    const coupon = await Coupon.findOne({ couponCode: couponCode.toUpperCase() });

    // Step 4: Validate coupon existence
    if (!coupon) {
      return res.status(404).json(apiResponse(404, false, 'Coupon not found'));
    }

    // Step 5: Update fields if provided
    if (discountType) {
      if (!['Percentage', 'Flat'].includes(discountType)) {
        return res.status(400).json(apiResponse(400, false, 'Invalid discount type. Must be "Percentage" or "Flat"'));
      }
      coupon.discountType = discountType;
    }

    if (discountValue) {
      if (coupon.discountType === 'Percentage' && (discountValue > 100 || discountValue <= 0)) {
        return res.status(400).json(apiResponse(400, false, 'Percentage discount must be between 0 and 100'));
      }
      if (coupon.discountType === 'Flat' && discountValue <= 0) {
        return res.status(400).json(apiResponse(400, false, 'Flat discount must be greater than 0'));
      }
      coupon.discountValue = discountValue;
    }

    if (minimumPurchase) {
      if (minimumPurchase < 0) {
        return res.status(400).json(apiResponse(400, false, 'Minimum purchase cannot be negative'));
      }
      coupon.minimumPurchase = minimumPurchase;
    }

    if (expirationDate) {
      const expiration = new Date(expirationDate);
      if (isNaN(expiration.getTime()) || expiration <= new Date()) {
        return res.status(400).json(apiResponse(400, false, 'Expiration date must be a valid date in the future'));
      }
      coupon.expirationDate = expiration;
    }

    if (isActive !== undefined) {
      coupon.isActive = isActive;
    }

    // Step 6: Save updated coupon
    await coupon.save();

    // Step 7: Return response
    return res.status(200).json(apiResponse(200, true, 'Coupon updated successfully', { coupon }));
  } catch (error) {
    // Step 8: Handle errors
    if (error.code === 11000) {
      return res.status(400).json(apiResponse(400, false, 'Coupon code already exists'));
    }
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

// Delete a coupon by couponCode
exports.deleteCoupon = async (req, res) => {
  try {
    // Step 1: Extract input
    const { couponCode } = req.body;

    // Step 2: Validate input
    if (!couponCode) {
      return res.status(400).json(apiResponse(400, false, 'Coupon code is required'));
    }

    // Step 3: Find and delete coupon
    const deletedCoupon = await Coupon.findOneAndDelete({
      couponCode: couponCode.toUpperCase(),
    });

    // Step 4: Validate deletion
    if (!deletedCoupon) {
      return res.status(404).json(apiResponse(404, false, 'Coupon not found'));
    }

    // Step 5: Return response
    return res.status(200).json(
      apiResponse(200, true, 'Coupon deleted successfully', {
        couponCode: deletedCoupon.couponCode,
      })
    );
  } catch (error) {
    // Step 6: Error handling
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};


// Get all coupons or a specific coupon by couponCode
exports.getAllCoupons = async (req, res) => {
  try {

    // Fetch All coupons
    const coupons = await Coupon.find({})

    // Handle case where no coupons are found
    if (!coupons || coupons.length === 0) {
      return res.status(404).json(apiResponse(404, false, 'No coupons found'));
    }

    // Return response
    return res.status(200).json(apiResponse(200, true, 'Coupons retrieved successfully', coupons));
  } catch (error) {
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};