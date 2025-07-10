const express = require("express");
const router = express.Router();
const multer = require("multer");
const { verifyToken } = require("../../middlewares/verifyToken");
const { isPartner } = require("../../middlewares/isPartner");
const { isAdmin } = require("../../middlewares/isAdmin");
const {
  createPartnerOrder,
  returnAndRefund,
  fetchAllPartnerOrders,
  fetchPartnerOrderByOrderId,
  creditRefundToWallet,
  updateOrderStatus,
  updatePaymentStatus,
  updateDeliveryDate,
} = require("../../controllers/partnerController/partnerOrderController");

// Configure Multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Create a new order (with cheque image upload)
router.post(
  "/create",
  verifyToken,
  isPartner,
  upload.single("chequeImageFile"),
  createPartnerOrder
);

// Fetch all orders for a partner
router.get("/", verifyToken, isPartner, fetchAllPartnerOrders);

// Fetch a specific order by orderId
router.get("/:orderId", verifyToken, isPartner, fetchPartnerOrderByOrderId);

// Request return and refund
router.post("/return-refund", verifyToken, isPartner, returnAndRefund);

// Credit refund amount to wallet
router.post("/credit-refund", verifyToken, isAdmin, creditRefundToWallet);


// Update order status
router.put("/status", verifyToken, isAdmin, updateOrderStatus);

// Update payment status
router.put("/payment-status", verifyToken, isAdmin, updatePaymentStatus);

// Update delivery date
router.put("/delivery-date", verifyToken, isAdmin, updateDeliveryDate);

module.exports = router;
