const mongoose = require("mongoose");
const UserOrder = require("../../models/User/UserOrder");
const ItemDetail = require("../../models/Items/ItemDetail");
const UserAddress = require("../../models/User/UserAddress");
const { apiResponse } = require("../../utils/apiResponse");
const razorpay = require("../../config/razorpay");
const crypto = require("crypto");

// Utility to populate order fields
const populateOrder = (query) =>
  query
    .populate("userId", "name email")
    .populate("orderDetails.itemId", "name price")
    .populate("cancelStatus.itemId", "name price")
    .populate("refund.itemId", "name price")
    .populate("returnAndRefund.itemId", "name price")
    .populate("exchange.itemId", "name price")
    .populate("shippingAddressId", "address city state country postalCode")
    .populate(
      "returnAndRefund.pickupLocationId",
      "address city state country postalCode"
    )
    .populate(
      "exchange.pickupLocationId",
      "address city state country postalCode"
    );

// Create Order Controller
exports.createOrder = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      orderDetails,
      invoice,
      shippingAddressId,
      paymentMethod,
      totalAmount,
    } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Validate required fields for all orders
    if (!orderDetails || !Array.isArray(invoice) || invoice.length === 0) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "orderDetails and non-empty invoice array are required",
            null
          )
        );
    }

    // Validate invoice array entries
    for (const entry of invoice) {
      if (
        !entry.key ||
        typeof entry.key !== "string" ||
        entry.key.trim() === ""
      ) {
        return res
          .status(400)
          .json(
            apiResponse(400, "Each invoice entry must have a valid key", null)
          );
      }
      if (
        entry.value === undefined ||
        entry.value === null ||
        entry.value.toString().trim() === ""
      ) {
        return res
          .status(400)
          .json(
            apiResponse(400, "Each invoice entry must have a valid value", null)
          );
      }
    }

    // Validate totalAmount
    if (typeof totalAmount !== "number" || totalAmount <= 0) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "Valid totalAmount is required and must be positive",
            null
          )
        );
    }

    // Validate orderDetails array
    if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "orderDetails array is required and cannot be empty",
            null
          )
        );
    }

    // Validate each item in the orderDetails array and check against ItemDetail
    for (const item of orderDetails) {
      // Validate itemId
      if (!item.itemId || !mongoose.Types.ObjectId.isValid(item.itemId)) {
        return res
          .status(400)
          .json(
            apiResponse(400, "Valid itemId is required for all items", null)
          );
      }

      // Validate color, size, skuId, and quantity
      if (
        !item.color ||
        !item.size ||
        !item.skuId ||
        !item.quantity ||
        item.quantity < 1
      ) {
        return res
          .status(400)
          .json(
            apiResponse(
              400,
              "Color, size, skuId, and valid quantity are required for all items",
              null
            )
          );
      }

      // Fetch ItemDetail by itemId
      const itemDetail = await ItemDetail.findOne({ itemId: item.itemId });
      if (!itemDetail) {
        return res
          .status(404)
          .json(
            apiResponse(
              404,
              `ItemDetail not found for itemId: ${item.itemId}`,
              null
            )
          );
      }

      // Check if color, size, and skuId match an entry in imagesByColor
      const colorEntry = itemDetail.imagesByColor.find(
        (entry) => entry.color.toLowerCase() === item.color.toLowerCase()
      );
      if (!colorEntry) {
        return res
          .status(400)
          .json(
            apiResponse(
              400,
              `Color ${item.color} not available for itemId: ${item.itemId}`,
              null
            )
          );
      }

      const sizeEntry = colorEntry.sizes.find(
        (size) => size.size === item.size && size.skuId === item.skuId
      );
      if (!sizeEntry) {
        return res
          .status(400)
          .json(
            apiResponse(
              400,
              `Size ${item.size} or skuId ${item.skuId} not available for color ${item.color} in itemId: ${item.itemId}`,
              null
            )
          );
      }

      // Check stock availability
      if (sizeEntry.stock < item.quantity) {
        return res
          .status(400)
          .json(
            apiResponse(
              400,
              `Insufficient stock for itemId: ${item.itemId}, size: ${item.size}`,
              null
            )
          );
      }

      // Reduce stock
      sizeEntry.stock -= item.quantity;
      await itemDetail.save();
    }

    // Validate shippingAddressId if provided
    if (shippingAddressId) {
      if (!mongoose.Types.ObjectId.isValid(shippingAddressId)) {
        return res
          .status(400)
          .json(apiResponse(400, "Invalid shippingAddressId", null));
      }
      // Check if shippingAddressId exists in UserAddress
      const addressExists = await UserAddress.findOne({
        userId,
        "addressDetail._id": shippingAddressId,
      });
      if (!addressExists) {
        return res
          .status(404)
          .json(apiResponse(404, "Shipping address not found", null));
      }
    }

    // Validate payment method
    if (!paymentMethod || !["Online", "COD"].includes(paymentMethod)) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "Valid payment method (Online or COD) is required",
            null
          )
        );
    }

    // Generate unique orderId
    const orderId = `ORD-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Initialize order data
    const orderData = {
      orderId,
      userId,
      orderDetails: orderDetails.map((item) => ({
        itemId: item.itemId,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        skuId: item.skuId,
        isItemCancel: false,
        isItemExchange: false,
      })),
      invoice: invoice.map((entry) => ({
        key: entry.key.trim().toLowerCase(),
        value: entry.value.toString().trim(),
      })),
      shippingAddressId,
      paymentMethod,
      isOrderPlaced: false,
      totalAmount,
      orderStatus: "Initiated",
      paymentStatus: "Pending",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      razorpaySignature: null,
      cancelStatus: [],
      refund: [],
      returnAndRefund: [],
      exchange: [],
      isOrderCancelled: false,
      deliveryDate: null,
    };

    // Handle payment method-specific logic
    if (paymentMethod === "COD") {
      orderData.isOrderPlaced = true;
      orderData.orderStatus = "Confirmed";
      orderData.paymentStatus = "Pending"; // COD is pending until delivery
      // Reduce stock immediately after order placement for COD
      for (const item of orderDetails) {
        const itemDetail = await ItemDetail.findOne({ itemId: item.itemId });
        const colorEntry = itemDetail.imagesByColor.find(
          (entry) => entry.color.toLowerCase() === item.color.toLowerCase()
        );
        const sizeEntry = colorEntry.sizes.find(
          (size) => size.size === item.size && size.skuId === item.skuId
        );
        sizeEntry.stock -= item.quantity;
        await itemDetail.save();
      }
    } else if (paymentMethod === "Online") {
      const options = {
        amount: totalAmount * 100, // Convert to paise
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        payment_capture: 1,
      };
      // Create Razorpay Order
      const order = await razorpay.orders.create(options);
      orderData.razorpayOrderId = order.id;
    }

    // Create new order
    const newOrder = new UserOrder(orderData);

    // Save the order
    const savedOrder = await newOrder.save();

    // Populate referenced fields for response
    const populatedOrder = await populateOrder(
      UserOrder.findById(savedOrder._id)
    );

    return res.status(201).json(
      apiResponse(201, "Order created successfully", {
        order: populatedOrder,
      })
    );
  } catch (error) {
    console.error("Error creating order:", error.message);
    return res
      .status(400)
      .json(
        apiResponse(400, error.message || "Error while creating order", null)
      );
  }
};

// Verify Payment Controller
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    // Update Order Payment Status
    let userOrder = await UserOrder.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        $set: {
          paymentStatus: "Paid",
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
        },
      },
      { new: true }
    );

    if (!userOrder) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Reduce stock after payment verification
    for (const item of userOrder.orderDetails) {
      const itemDetail = await ItemDetail.findOne({ itemId: item.itemId });
      const colorEntry = itemDetail.imagesByColor.find(
        (entry) => entry.color.toLowerCase() === item.color.toLowerCase()
      );
      const sizeEntry = colorEntry.sizes.find(
        (size) => size.size === item.size && size.skuId === item.skuId
      );
      sizeEntry.stock -= item.quantity;
      await itemDetail.save();
    }

    return res.status(200).json({ success: true, message: "Payment verified successfully" });
  } catch (error) {
    console.error("Error verifying payment:", error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
};




// Fetch All User Orders Controller
exports.fetchUserOrders = async (req, res) => {
  try {
    const { userId } = req.user;
    const { page = 1, limit = 10 } = req.query;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Validate pagination parameters
    const pageNum = Number(page);
    const limitNum = Number(limit);
    if (pageNum < 1 || limitNum < 1) {
      return res.status(400).json(apiResponse(400, "Page and limit must be positive numbers", null));
    }

    // Fetch orders and populate referenced fields
    const orders = await populateOrder(
      UserOrder.find({ userId })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
    );

    const total = await UserOrder.countDocuments({ userId });

    // Prepare response data
    const responseData = {
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    };

    return res
      .status(200)
      .json(apiResponse(200, "User orders fetched successfully", responseData));
  } catch (error) {
    console.error("Error fetching user orders:", error.message);
    return res
      .status(500)
      .json(apiResponse(500, error.message || "Server error while fetching user orders", null));
  }
};

// Fetch Confirmed User Orders Controller
exports.fetchConfirmedUserOrders = async (req, res) => {
  try {
    // Check if user info exists
    if (!req.user || !req.user.userId) {
      return res.status(401).json(apiResponse(401, "Unauthorized", null));
    }

    const { userId } = req.user;
    const { page = 1, limit = 10 } = req.query;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Fetch orders with orderStatus: "Confirmed"
    const orders = await UserOrder.find({ userId, orderStatus: "Confirmed" })
      .populate("orderDetails.itemId", "name description")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await UserOrder.countDocuments({
      userId,
      orderStatus: "Confirmed",
    });

    // Optional: Handle no orders
    if (orders.length === 0) {
      return res.status(200).json(
        apiResponse(200, "No confirmed orders found", {
          orders: [],
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / limit),
          },
        })
      );
    }

    // Send response
    return res.status(200).json(
      apiResponse(200, "Confirmed user orders fetched successfully", {
        orders,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      })
    );
  } catch (error) {
    console.error("Error fetching confirmed user orders:", error);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          "Server error while fetching confirmed user orders",
          null
        )
      );
  }
};

// Fetch Specific Order and All User Orders Controller
exports.fetchOrderByOrderId = async (req, res) => {
  try {
    const { userId } = req.user;
    const { orderId } = req.params;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Validate orderId
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      return res
        .status(400)
        .json(apiResponse(400, "Valid orderId is required", null));
    }

    // Fetch the specific order by userId and orderId
    const specificOrder = await populateOrder(
      UserOrder.findOne({ userId, orderId })
    );

    // If specific order not found, return 404
    if (!specificOrder) {
      return res
        .status(404)
        .json(apiResponse(404, "Order not found for this user", null));
    }

    // Fetch all orders for the user
    const allOrders = await populateOrder(
      UserOrder.find({ userId }).sort({ createdAt: -1 })
    );

    // Prepare response data
    const responseData = {
      specificOrder,
      allOrders,
    };

    return res
      .status(200)
      .json(
        apiResponse(
          200,
          "Order and user orders fetched successfully",
          responseData
        )
      );
  } catch (error) {
    console.error("Error fetching order and user orders:", error);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          "Server error while fetching order and user orders",
          null
        )
      );
  }
};



// Cancel Specific Item in Order Controller
exports.cancelOrder = async (req, res) => {
  try {
    const { userId } = req.user;
    const { orderId, itemId } = req.body;  // We now accept itemId to cancel a specific item

    // Validate orderId and itemId
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return apiResponse(res, 400, "Invalid order ID");
    }

    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return apiResponse(res, 400, "Invalid item ID");
    }

    // Find the order by orderId and userId
    const order = await UserOrder.findOne({ orderId:orderId, userId });

    if (!order) {
      return apiResponse(res, 404, "Order not found");
    }

    // Check if order is already cancelled or delivered
    if (order.isOrderCancelled || order.orderStatus === "Delivered") {
      return apiResponse(res, 400, "Order already cancelled or delivered");
    }

    // Find the item within the order that matches the itemId
    const itemToCancel = order.orderDetails.find(item => item.itemId.toString() === itemId.toString());

    if (!itemToCancel) {
      return apiResponse(res, 404, "Item not found in the order");
    }

    // Handle cancellation logic based on the payment method
    if (order.paymentMethod === "COD") {
      // For COD orders, simply update the status of the item and the order status if needed
      itemToCancel.isItemCancel = true;

      // Check if all items are cancelled to update order status to 'Cancelled' or 'Partiallycancelled'
      const allItemsCancelled = order.orderDetails.every(item => item.isItemCancel);

      if (allItemsCancelled) {
        order.orderStatus = "Cancelled";
        order.isOrderCancelled = true;
      } else {
        order.orderStatus = "Partiallycancelled";  // If not all items are cancelled, set the status to Partiallycancelled
      }

      // Save the updated order with cancelled item
      await order.save();

      return apiResponse(res, 200, "Item cancelled successfully");
    }

    if (order.paymentMethod === "Online" && order.paymentStatus === "Paid") {
      // For Online orders, perform the refund via Razorpay

      // Check if Razorpay Payment ID exists before processing the refund
      if (!order.razorpayPaymentId) {
        return apiResponse(res, 400, "Payment not found for the order");
      }

      //Pending
      // Calculate refund amount for the cancelled item(s)
      const refundAmount = itemToCancel.quantity * itemToCancel.price * 100;  // Refund amount is in paise

      // Create a refund for the cancelled item(s)
      const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
        amount: refundAmount, // Refund amount for the specific item
      });

      // Check the status of the refund
      if (refund.status !== "processed") {
        return apiResponse(res, 500, "Refund processing failed");
      }

      // Mark the specific item as cancelled
      itemToCancel.isItemCancel = true;

      // Add refund information to the order
      order.refund.push({
        itemId: itemToCancel.itemId,
        refundReason: "Item cancelled",
        requestDate: new Date(),
        refundAmount: itemToCancel.quantity * itemToCancel.price,
        refundTransactionId: refund.payment_id,
        refundStatus: "initated",
      });

      // Check if all items are cancelled to update order status to 'Cancelled' or 'Partiallycancelled'
      const allItemsCancelled = order.orderDetails.every(item => item.isItemCancel);

      if (allItemsCancelled) {
        order.orderStatus = "Cancelled";
        order.isOrderCancelled = true;
      } else {
        order.orderStatus = "Partiallycancelled";  // If not all items are cancelled, set the status to Partiallycancelled
      }

      // Save the updated order with the specific item cancelled and refund processed
      await order.save();

      return apiResponse(res, 200, "Item cancelled and refund processed successfully");
    }

    // Handle case if payment status is not 'Paid' for Online orders
    return apiResponse(res, 400, "Unable to cancel the item. Payment not successful.");
  } catch (err) {
    console.error("Error cancelling item in order:", err);
    return apiResponse(res, 500, "Internal server error");
  }
};



exports.returnAndRefund = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      orderId,
      itemId,
      pickupLocationId,
      returnReason,
      specificReturnReason,
      bankDetails,
    } = req.body;

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid or missing orderId" });
    }
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: "Invalid or missing itemId" });
    }
    if (!pickupLocationId || !mongoose.Types.ObjectId.isValid(pickupLocationId)) {
      return res.status(400).json({ message: "Invalid or missing pickupLocationId" });
    }

    const order = await UserOrder.findOne({ orderId: orderId, userId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.orderStatus !== "Delivered") {
      return res.status(400).json({ message: "Only delivered orders can be returned" });
    }

    const item = order.orderDetails.find(
      (i) => i.itemId.toString() === itemId.toString()
    );

    if (!item) {
      return res.status(404).json({ message: "Item not found in order" });
    }

    if (item.isItemReturn) {
      return res.status(400).json({ message: "Item already returned" });
    }

    // Mark the item as returned
    item.isItemReturn = true;

    // Calculate refund amount (can be extended for discounts, coupons, etc.)
    const refundAmount = item.quantity * (item.price || 0); // Adjust as per real pricing logic

    let refundTransactionId = null;
    let refundStatus = "Initiated";

    // Refund logic based on payment method
    if (order.paymentMethod === "Online" && order.razorpayPaymentId) {
      try {
        const refund = await razorpayInstance.payments.refund(order.razorpayPaymentId, {
          amount: refundAmount * 100, // Razorpay expects amount in paise
        });

        refundTransactionId = refund.id;
        refundStatus = refund.status === "processed" ? "Completed" : "Processing";
      } catch (err) {
        return res.status(500).json({ message: "Refund initiation failed via Razorpay", error: err.message });
      }
    }

    if (order.paymentMethod === "COD") {
      if (
        !bankDetails ||
        !bankDetails.accountNumber ||
        !bankDetails.ifscCode ||
        !bankDetails.accountName ||
        !bankDetails.branchName
      ) {
        return res.status(400).json({ message: "Bank details are required for COD refund" });
      }

      // Simulate transaction ID generation
      refundTransactionId = `COD-${Date.now()}`;
      refundStatus = "Initiated";
    }

    // Add to returnAndRefund array
    order.returnAndRefund.push({
      itemId,
      returnReason,
      specificReturnReason,
      requestDate: new Date(),
      pickupLocationId,
      returnAndRefundTransactionId: refundTransactionId,
      bankDetails: order.paymentMethod === "COD" ? bankDetails : undefined,
      refundStatus,
    });

    // Update order status if all items are returned
    const allReturned = order.orderDetails.every(item => item.isItemReturn);
    order.orderStatus = allReturned ? "Returned" : "Partiallycancelled";

    await order.save();

    return res.status(200).json({ message: "Return and refund initiated successfully." });
  } catch (error) {
    console.error("returnAndRefund error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const UserOrder = require("../models/UserOrder");
const ItemDetail = require("../models/ItemDetail");

exports.exchangeItem = async (req, res) => {
  try {
    const {
      itemId,
      orderId,
      size,
      color,
      pickupLocationId,
      exchangeReason,
      exchangeSpecificReason,
    } = req.body;

    const userId = req.user?._id || req.user?.userId; // Fetch userId from req.user

    // Validate required fields
    if (
      !itemId ||
      !orderId ||
      !size ||
      !color ||
      !pickupLocationId ||
      !exchangeReason
    ) {
      return res.status(400).json({
        message: "itemId, orderId, size, color, pickupLocationId, and exchangeReason are required.",
      });
    }

    // Step 1: Check availability in ItemDetail
    const itemDetail = await ItemDetail.findOne({ itemId });

    if (!itemDetail) {
      return res.status(404).json({ message: "Item not found." });
    }

    // Find color block
    const colorBlock = itemDetail.imagesByColor.find(
      (c) => c.color.toLowerCase() === color.toLowerCase()
    );

    if (!colorBlock) {
      return res.status(404).json({ message: "Color not available." });
    }

    // Find size inside that color block
    const sizeBlock = colorBlock.sizes.find(
      (s) => s.size.toLowerCase() === size.toLowerCase() && s.stock > 0
    );

    if (!sizeBlock) {
      return res.status(404).json({ message: "Size not available or out of stock." });
    }

    // Step 2: Update the UserOrder
    const updatedOrder = await UserOrder.findOneAndUpdate(
      { _id: orderId, userId, "orderDetails.itemId": itemId },
      {
        $push: {
          exchange: {
            itemId,
            requestDate: new Date(),
            exchangeReason, // coming from req.body
            exchangeSpecificReason, // coming from req.body (optional)
            color,
            size,
            skuId: sizeBlock.skuId,
            isSizeAvailability: true,
            pickupLocationId,
            exchangeStatus: "Initiated",
          },
        },
      },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found for this user or item not found in order." });
    }

    return res.status(200).json({ message: "Exchange initiated successfully.", order: updatedOrder });

  } catch (error) {
    console.error("Exchange Item Error:", error);
    res.status(500).json({ message: "Something went wrong.", error: error.message });
  }
};
