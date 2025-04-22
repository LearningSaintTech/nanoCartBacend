const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/verifyToken'); 
const { isPartner } = require('../../middlewares/isPartner'); 
const {
  createOrder,
  fetchUserOrders,
  fetchConfirmedUserOrders,
  fetchOrderByOrderId,
  cancelOrder 
} = require('../../controllers/partnerController/partnerOrderController');

// Create a new order
router.post('/create',verifyToken,isPartner,createOrder);


// // Fetch all user orders
router.get('/', verifyToken, isPartner, fetchUserOrders);
 
// // Fetch confirmed user orders
// router.get("/confirmed", verifyToken, isPartner, fetchConfirmedUserOrders);

// // Fetch specific order by orderId and all user orders
router.get("/:orderId", verifyToken, isPartner, fetchOrderByOrderId);
// 
// //routes to cancel Order
// router.put("/cancel/:orderId", verifyToken, isPartner, cancelOrder);

module.exports = router;