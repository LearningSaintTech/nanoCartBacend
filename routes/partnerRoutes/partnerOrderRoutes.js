const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../../middlewares/verifyToken');
const { isPartner } = require('../../middlewares/isPartner');
const {
  createPartnerOrder,
  verifyPayment,
  requestReturnAndRefund,
  fetchAllPartnerOrders,
} = require('../../controllers/partnerController/partnerOrderController');

// Configure Multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Create a new order (with cheque image upload)
router.post('/create', verifyToken, isPartner, upload.single('chequeImageFile'), createPartnerOrder);

// Verify Razorpay payment
router.post('/verify-payment', verifyToken, isPartner, verifyPayment);

// Request return and refund
router.post('/return-refund', verifyToken, isPartner, requestReturnAndRefund);

// Fetch all orders for a partner
router.get('/', verifyToken, isPartner, fetchAllPartnerOrders);

module.exports = router;