const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/verifyToken.js');
const { isAdmin } = require('../../middlewares/isAdmin.js');
const {
  getUserOrderDetails,
  getAllOrders,
  filterOrdersByStatus,
  filterOrdersByPaymentMode,
  getTotalRevenue,
  getFilteredTotalRevenue,
  getItemsByOrderedNumber,
  getPartnerOrderDetails,
  getTotalUserOrdersCount,
  getTotalPartnerOrdersCount,
  getTotalConfirmedUserOrdersCount,
  getTotalConfirmedPartnerOrdersCount,
  getTotalPendingUserOrdersCount,
  getTotalPendingPartnerOrdersCount,
  getTotalCancelledUserOrdersCount,
  getTotalReturnedUserOrdersCount,
  getTotalReturnedPartnerOrdersCount,
  getTotalExchangedUserOrdersCount,
  getTotalDispatchedUserOrdersCount,
  getAllPendingOrdersUser,
  getAllCancelledOrdersUser,
  getAllReturnedOrdersUser,
  getAllExchangedOrdersUser,
  getAllDispatchedOrdersUser,
  getAllPendingOrdersPartner,
  getAllReturnedOrdersPartner,
  getAllDispatchedOrdersPartner,
  getAllUserOrders,
  getAllPartnerOrders
} = require('../../controllers/adminSideController/adminOrderController.js');

// Route to get user order details
router.get('/users/:userId/orders', verifyToken, isAdmin, getUserOrderDetails);

// Route to get all orders (user and partner)
router.get('/orders/all', verifyToken, isAdmin, getAllOrders);

// Route to get all user orders
router.get('/user-orders', verifyToken, isAdmin,getAllUserOrders);

// Route to get all partner orders
router.get('/partner-orders', verifyToken, isAdmin,getAllPartnerOrders);

// Route to filter orders by status
router.get('/orders/filter/status', verifyToken, isAdmin, filterOrdersByStatus);

// Route to filter orders by payment mode
router.get('/orders/filter/payment-mode', verifyToken, isAdmin, filterOrdersByPaymentMode);

// Route to get total revenue
router.get('/revenue/total', verifyToken, isAdmin, getTotalRevenue);

// Route to get total revenue
router.get('/revenue/total/filter', verifyToken, isAdmin, getFilteredTotalRevenue);

// Route to get items by ordered number
router.get('/items/ordered', verifyToken, isAdmin, getItemsByOrderedNumber);

// Route to get partner order details
router.get('/partner/:partnerId/orders', verifyToken, isAdmin, getPartnerOrderDetails);

// Suggested routes for additional controller functions
router.get('/orders/total', verifyToken, isAdmin, getTotalUserOrdersCount);
router.get('/orders/total/partner', verifyToken, isAdmin, getTotalPartnerOrdersCount);
router.get('/orders/confirmed/total', verifyToken, isAdmin, getTotalConfirmedUserOrdersCount);
router.get('/orders/confirmed/total/partner', verifyToken, isAdmin, getTotalConfirmedPartnerOrdersCount);
router.get('/orders/pending/total', verifyToken, isAdmin, getTotalPendingUserOrdersCount);
router.get('/orders/pending/total/partner', verifyToken, isAdmin, getTotalPendingPartnerOrdersCount);
router.get('/orders/cancelled/total', verifyToken, isAdmin, getTotalCancelledUserOrdersCount);
router.get('/orders/returned/total', verifyToken, isAdmin, getTotalReturnedUserOrdersCount);
router.get('/orders/returned/total/partner', verifyToken, isAdmin, getTotalReturnedPartnerOrdersCount);
router.get('/orders/exchanged/total', verifyToken, isAdmin, getTotalExchangedUserOrdersCount);
router.get('/orders/dispatched/total', verifyToken, isAdmin, getTotalDispatchedUserOrdersCount);



router.get('/orders/pending', verifyToken, isAdmin, getAllPendingOrdersUser);
router.get('/orders/cancelled', verifyToken, isAdmin, getAllCancelledOrdersUser);
router.get('/orders/returned', verifyToken, isAdmin, getAllReturnedOrdersUser);
router.get('/orders/exchanged', verifyToken, isAdmin, getAllExchangedOrdersUser);
router.get('/orders/dispatched', verifyToken, isAdmin, getAllDispatchedOrdersUser);

// Route to get all pending orders
router.get("/orders/pending/partner", getAllPendingOrdersPartner);

// Route to get all returned orders
router.get("/orders/returned/partner", getAllReturnedOrdersPartner);

// Route to get all dispatched orders
router.get("/orders/dispatched/partner", getAllDispatchedOrdersPartner);

module.exports = router;