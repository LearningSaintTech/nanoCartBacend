// const express = require('express');
// const router = express.Router();
// const { verifyToken } = require('../../middlewares/verifyToken');
// const { isUser } = require('../../middlewares/isUser');
// const {
//   createUserOrder,
//   verifyPayment,
//   fetchUserOrders,
//   fetchOrderByOrderId,
//   cancelOrder,
//   returnRefund,
//   returnAndExchange,
// } = require('../../controllers/userOrderController/userOrderController');

// // User Routes
// // Create a new order
// router.post('/create', verifyToken, isUser, createUserOrder);

// // Verify payment for online orders
// router.post('/verify-payment', verifyToken, isUser, verifyPayment);

// // Fetch all user orders-> orderHistroy
// router.get('/', verifyToken, isUser, fetchUserOrders);

// // Fetch specific order by orderId 
// router.get('/:orderId', verifyToken, isUser, fetchOrderByOrderId);

// // Cancel an order
// router.post('/cancel', verifyToken, isUser, cancelOrder);

// // Initiate return and refund for an item
// router.post('/return-refund', verifyToken, isUser, returnRefund);

// // Initiate return and exchange for an item
// router.post('/return-exchange', verifyToken, isUser, returnAndExchange);


// module.exports = router;



const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/verifyToken');
const { isUser } = require('../../middlewares/isUser');
const {
  createUserOrder,
  verifyPayment,
  fetchAllUserOrders,
  fetchOrderByOrderId,
  cancelOrder,
  returnRefund,
  returnAndExchange,
  handlePhonePeCallback,
} = require('../../controllers/userOrderController/userOrderController');

// User Routes
router.post('/create', verifyToken, isUser, createUserOrder);
router.post('/verify-payment', verifyToken, isUser, verifyPayment);
router.post('/phonepe/callback', handlePhonePeCallback);

//Routes for OrderHistory
router.get('/', verifyToken, isUser, fetchAllUserOrders);

//Routes for specific order
router.get('/:orderId', verifyToken, isUser, fetchOrderByOrderId);


router.post('/cancel', verifyToken, isUser, cancelOrder);
router.post('/return-refund', verifyToken, isUser, returnRefund);
router.post('/return-exchange', verifyToken, isUser, returnAndExchange);


module.exports = router;