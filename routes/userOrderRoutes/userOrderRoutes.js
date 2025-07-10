const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/verifyToken');
const { isUser } = require('../../middlewares/isUser');
const { isAdmin } = require('../../middlewares/isAdmin');
const {
  createUserOrder,
  verifyPayment,
  FetchOrderHistory,
  FetchOrderHistoryByAdmin,
  cancelOrder,
  fetchOrderByOrderId,
  returnRefund,
  returnAndExchange,
  handlePhonePeCallback,
} = require('../../controllers/userOrderController/userOrdersControllerSir');

// User Routes
router.post('/create', verifyToken, isUser, createUserOrder);
router.get("/:orderId",verifyToken,isUser,fetchOrderByOrderId);
router.get('/', verifyToken, isUser, FetchOrderHistory);


router.post('/verify-payment', verifyToken, isUser, verifyPayment);
router.post('/phonepe/callback', handlePhonePeCallback);

router.post('/cancel', verifyToken, isUser, cancelOrder);
router.post('/return-refund', verifyToken, isUser, returnRefund);
router.post('/return-exchange', verifyToken, isUser, returnAndExchange);


router.get('/admin/:userId', verifyToken, isAdmin, FetchOrderHistoryByAdmin);

module.exports = router;