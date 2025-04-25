const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/verifyToken'); 
const { isUser } = require('../../middlewares/isUser'); 
const {
  createOrder,
  fetchUserOrders,
  fetchConfirmedUserOrders,
  fetchOrderByOrderId,
  cancelOrders,
  exchangeOrders
} = require('../../controllers/userOrderController/userOrderController');

// Create a new order
router.post('/create', verifyToken, isUser,createOrder);

// Fetch all user orders
router.get('/', verifyToken, isUser, fetchUserOrders);

// Fetch confirmed user orders
router.get('/confirmed', verifyToken, isUser, fetchConfirmedUserOrders);

// Fetch specific order by orderId and all user orders
router.get('/:orderId', verifyToken, isUser,fetchOrderByOrderId);

// //routes to cancel Order
// router.put("/cancel",verifyToken,isUser,cancelOrders)

// //routes for exchange Order
// router.put("/exchange",verifyToken,isUser,exchangeOrders)

module.exports = router;