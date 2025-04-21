const UserOrder = require("../../models/User/UserOrder");
const { apiResponse } = require("../../utils/apiResponse");


exports.createOrder = async (req, res) => {
  try {
    const {
      customer,
      items,
      totalPrice,
      shippingAddress,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      shippingStatus,
      skuId,
    } = req.body;

    // Basic validation
    if (!customer || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json(
        apiResponse(400, false, "Customer and order items are required")
      );
    }

    if (!totalPrice || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json(
        apiResponse(400, false, "Payment details are required")
      );
    }

    // Optional validation for item structure
    for (let i = 0; i < items.length; i++) {
      if (!items[i].itemDetails) {
        return res.status(400).json(
          apiResponse(400, false, `Missing itemDetails in item at index ${i}`)
        );
      }
    }

    // Create the order
    const newOrder = await UserOrder.create({
      customer,
      items,
      totalPrice,
      shippingAddress,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      shippingStatus, // will use default if not provided
      skuId,
    });

    return res.status(201).json(
      apiResponse(201, true, "Order placed successfully", newOrder)
    );
  } catch (error) {
    console.error("Error creating order:", error.message);
    return res.status(500).json(
      apiResponse(500, false, "Internal Server Error", { error: error.message })
    );
  }
};



exports.updateOrder = async (req, res) => {
  try {
    const orderId = req.params.id;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json(
        apiResponse(400, false, "Invalid order ID")
      );
    }

    // Update fields from request body
    const updatedData = req.body;

    const updatedOrder = await UserOrder.findByIdAndUpdate(
      orderId,
      updatedData,
      {
        new: true,           // Return the updated document
        runValidators: true  // Validate fields before updating
      }
    ).populate("customer shippingAddress items.itemDetails exchange.newItemId");

    if (!updatedOrder) {
      return res.status(404).json(
        apiResponse(404, false, "Order not found")
      );
    }

    return res.status(200).json(
      apiResponse(200, true, "Order updated successfully", updatedOrder)
    );
  } catch (error) {
    console.error("Error updating order:", error.message);
    return res.status(500).json(
      apiResponse(500, false, "Internal Server Error", { error: error.message })
    );
  }
};


exports.deleteOrder = async (req, res) => {
    try {
      const orderId = req.params.id;
  
      // Validate MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json(
          apiResponse(400, false, "Invalid Order ID")
        );
      }
  
      const deletedOrder = await UserOrder.findByIdAndDelete(orderId);
  
      if (!deletedOrder) {
        return res.status(404).json(
          apiResponse(404, false, "Order not found")
        );
      }
  
      return res.status(200).json(
        apiResponse(200, true, "Order deleted successfully", deletedOrder)
      );
    } catch (error) {
      console.error("Error deleting order:", error.message);
      return res.status(500).json(
        apiResponse(500, false, "Internal Server Error", { error: error.message })
      );
    }
  };


  exports.getOrderById = async (req, res) => {
    try {
      const orderId = req.params.id;
  
      // Validate MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json(
          apiResponse(400, false, "Invalid Order ID")
        );
      }
  
      const order = await UserOrder.findById(orderId)
        .populate("customer")
        .populate("shippingAddress")
        .populate("items.itemDetails")
        .populate("exchange.newItemId");
  
      if (!order) {
        return res.status(404).json(
          apiResponse(404, false, "Order not found")
        );
      }
  
      return res.status(200).json(
        apiResponse(200, true, "Order fetched successfully", order)
      );
    } catch (error) {
      console.error("Error fetching order:", error.message);
      return res.status(500).json(
        apiResponse(500, false, "Internal Server Error", { error: error.message })
      );
    }
  };



exports.getAllOrders = async (req, res) => {
  try {
    const orders = await UserOrder.find()
      .populate("customer")
      .populate("shippingAddress")
      .populate("items.itemDetails")
      .populate("exchange.newItemId")
      .sort({ createdAt: -1 }); // latest orders first

    return res.status(200).json(
      apiResponse(200, true, "All orders fetched successfully", orders)
    );
  } catch (error) {
    console.error("Error fetching orders:", error.message);
    return res.status(500).json(
      apiResponse(500, false, "Internal Server Error", { error: error.message })
    );
  }
};
