const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/verifyToken');
const { isUser } = require('../../middlewares/isUser');
const {
  createUserOrder,
  verifyPayment,
  fetchUserOrders,
  fetchConfirmedUserOrders,
  fetchOrderByOrderId,
  cancelOrder,
  returnRefund,
  returnAndExchange,
} = require('../../controllers/userOrderController/userOrderController');

// User Routes
// Create a new order
router.post('/create', verifyToken, isUser, createUserOrder);

// Verify payment for online orders
router.post('/verify-payment', verifyToken, isUser, verifyPayment);

// Fetch all user orders
router.get('/', verifyToken, isUser, fetchUserOrders);

// Fetch confirmed user orders
router.get('/confirmed', verifyToken, isUser, fetchConfirmedUserOrders);

// Fetch specific order by orderId and all user orders
router.get('/:orderId', verifyToken, isUser, fetchOrderByOrderId);

// Cancel an order
router.post('/cancel', verifyToken, isUser, cancelOrder);

// Initiate return and refund for an item
router.post('/return-refund', verifyToken, isUser, returnRefund);

// Initiate return and exchange for an item
router.post('/return-exchange', verifyToken, isUser, returnAndExchange);


module.exports = router;