const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/verifyToken');
const { isAdmin } = require('../../middlewares/isAdmin');


const {updateOrderStatus,updatePaymentStatus,updateItemRefundStatus,updateDeliveryDate}=require("../../controllers/userOrderController/orderStatusMaintainAdminController")


router.put("/order-status",verifyToken,isAdmin,updateOrderStatus);
router.put("/payment-status",verifyToken,isAdmin,updatePaymentStatus);
router.put("/item-refund-status",verifyToken,isAdmin,updateItemRefundStatus);
router.put("/item-refund-transaction",verifyToken,isAdmin,updateItemRefundStatus);
router.put("/delivery-date",verifyToken,isAdmin,updateDeliveryDate)


module.exports = router;