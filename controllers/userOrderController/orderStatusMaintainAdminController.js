const UserOrder=require("../../models/User/UserOrder")
const {apiResponse}=require("../../utils/apiResponse")


// Controller to update order status by admin
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId, orderStatus } = req.body;
    // Validate orderStatus
    const validOrderStatuses = [
      'Initiated',
      'Confirmed',
      'Ready for Dispatch',
      'Dispatched',
      'Delivered',
      'Cancelled',
      'Returned',
      'Exchange',
      'Partially Returned',
      'Partially Exchange',
    ];
    if (!orderStatus || !validOrderStatuses.includes(orderStatus)) {
      console.log('Invalid orderStatus:', orderStatus);
      return res.status(400).json(apiResponse(400, false, `Valid orderStatus is required. Must be one of: ${validOrderStatuses.join(', ')}`));
    }

    const order = await UserOrder.findOne({ orderId:orderId });
    if (!order) {
      console.log('Order not found:', orderId);
      return res.status(404).json(apiResponse(404, false, 'Order not found'));
    }

    // Update order status
    order.orderStatus = orderStatus;
    order.orderStatusDate=new Date();

    // Save order updates
    await order.save();

    return res.status(200).json(
      apiResponse(200, true, 'Order status updated successfully', { order })
    );
  } catch (error) {
    console.log(`Error updating order status: ${error.message}`);
    return res.status(500).json(
      apiResponse(500, false, error.message || 'Error updating order status')
    );
  }
};


// Controller to update payment status by admin
exports.updatePaymentStatus = async (req, res) => {

  try {
    const { orderId, paymentStatus } = req.body;


    // Validate paymentStatus
    const validPaymentStatuses = ['Pending', 'Paid', 'Failed', 'Refunded'];
    if (!paymentStatus || !validPaymentStatuses.includes(paymentStatus)) {
      console.log('Invalid paymentStatus:', paymentStatus);
      return res.status(400).json(apiResponse(400, false, `Valid paymentStatus is required. Must be one of: ${validPaymentStatuses.join(', ')}`));
    }

    // Find order
    const order = await UserOrder.findOne({ orderId });
    if (!order) {
      console.log('Order not found:', orderId);
      return res.status(404).json(apiResponse(404, false, 'Order not found'));
    }

    // Check if payment method is COD
    if (order.paymentMethod !== 'COD') {
      console.log('Payment status update not allowed for non-COD order:', orderId);
      return res.status(400).json(apiResponse(400, false, 'Payment status can only be updated for COD orders'));
    }

    // Update payment status
    order.paymentStatus = paymentStatus;

    // Save order updates
    await order.save();
    return res.status(200).json(
      apiResponse(200, true, 'Payment status updated successfully', { order })
    );
  } catch (error) {
    console.log(`Error updating payment status: ${error.message}`);
    return res.status(500).json(
      apiResponse(500, false, error.message || 'Error updating payment status')
    );
  }
};



// Controller to update refund status for a specific item by admin
exports.updateItemRefundStatus = async (req, res) => {

  try {
    const { orderId, itemId, refundStatus } = req.body;

    // Validate orderId
    if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
      console.log('Invalid orderId:', orderId);
      return res.status(400).json(apiResponse(400, false, 'Valid orderId is required'));
    }

    // Validate itemId
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      console.log('Invalid itemId:', itemId);
      return res.status(400).json(apiResponse(400, false, 'Valid itemId is required'));
    }

    // Validate refundStatus
    const validRefundStatuses = ['Initiated', 'Processing', 'Completed'];
    if (!refundStatus || !validRefundStatuses.includes(refundStatus)) {
      console.log('Invalid refundStatus:', refundStatus);
      return res.status(400).json(apiResponse(400, false, `Valid refundStatus is required. Must be one of: ${validRefundStatuses.join(', ')}`));
    }

    // Find order
    const order = await UserOrder.findOne({ orderId });
    if (!order) {
      console.log('Order not found:', orderId);
      return res.status(404).json(apiResponse(404, false, 'Order not found'));
    }

    // Find the specific orderDetail by itemId
    const orderDetail = order.orderDetails.find(
      (detail) => detail.itemId.toString() === itemId.toString()
    );
    if (!orderDetail) {
      console.log(`Item not found in order details: ${itemId}`);
      return res.status(404).json(apiResponse(404, false, `Item with ID ${itemId} not found in order details`));
    }

    // Check if isReturn is true and returnInfo exists
    if (!orderDetail.isReturn) {
      console.log(`No return initiated for item: ${itemId}`);
      return res.status(400).json(apiResponse(400, false, `No return initiated for item with ID ${itemId}`));
    }

    // Update refund status for the specific item
    orderDetail.returnInfo.refundStatus = refundStatus;

    // Save order updates
    await order.save();

    console.log(`Refund status updated successfully for itemId: ${itemId} in orderId: ${orderId}`);
    return res.status(200).json(
      apiResponse(200, true, 'Refund status updated successfully for item', { order })
    );
  } catch (error) {
    console.log(`Error updating refund status: ${error.message}`);
    return res.status(500).json(
      apiResponse(500, false, error.message || 'Error updating refund status')
    );
  }
};

// Controller to update refund status for a specific item by admin
exports.updateItemRefundTransaction = async (req, res) => {

  try {
    const { orderId, itemId, returnAndRefundTransactionId } = req.body;

    // Validate orderId
    if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
      console.log('Invalid orderId:', orderId);
      return res.status(400).json(apiResponse(400, false, 'Valid orderId is required'));
    }

    // Validate itemId
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      console.log('Invalid itemId:', itemId);
      return res.status(400).json(apiResponse(400, false, 'Valid itemId is required'));
    }

    // Find order
    const order = await UserOrder.findOne({ orderId });
    if (!order) {
      console.log('Order not found:', orderId);
      return res.status(404).json(apiResponse(404, false, 'Order not found'));
    }

    // Find the specific orderDetail by itemId
    const orderDetail = order.orderDetails.find(
      (detail) => detail.itemId.toString() === itemId.toString()
    );
    if (!orderDetail) {
      console.log(`Item not found in order details: ${itemId}`);
      return res.status(404).json(apiResponse(404, false, `Item with ID ${itemId} not found in order details`));
    }

    // Check if isReturn is true and returnInfo exists
    if (!orderDetail.isReturn) {
      console.log(`No return initiated for item: ${itemId}`);
      return res.status(400).json(apiResponse(400, false, `No return initiated for item with ID ${itemId}`));
    }

    // Update refund status for the specific item
    orderDetail.returnInfo.returnAndRefundTransactionId = returnAndRefundTransactionId;

    // Save order updates
    await order.save();

    console.log(`Refund status updated successfully for itemId: ${itemId} in orderId: ${orderId}`);
    return res.status(200).json(
      apiResponse(200, true, 'Refund status updated successfully for item', { order })
    );
  } catch (error) {
    console.log(`Error updating refund status: ${error.message}`);
    return res.status(500).json(
      apiResponse(500, false, error.message || 'Error updating refund status')
    );
  }
};




// Controller to update delivery date by admin
exports.updateDeliveryDate = async (req, res) => {

  try {
    const { orderId, deliveryDate } = req.body;


    // Validate deliveryDate
    if (!deliveryDate || isNaN(Date.parse(deliveryDate))) {
      console.log('Invalid deliveryDate:', deliveryDate);
      return res.status(400).json(apiResponse(400, false, 'Valid deliveryDate is required (must be a valid date)'));
    }

    //Find Order
    const order = await UserOrder.findOne({ orderId });
    if (!order) {
      console.log('Order not found:', orderId);
      return res.status(404).json(apiResponse(404, false, 'Order not found'));
    }

    // Update delivery date
    order.deliveryDate = new Date(deliveryDate);

    // Save order updates
    await order.save();
    return res.status(200).json(
      apiResponse(200, true, 'Delivery date updated successfully', { order })
    );
  } catch (error) {
    return res.status(500).json(
      apiResponse(500, false, error.message || 'Error updating delivery date')
    );
  }
};