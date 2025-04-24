const mongoose = require("mongoose");
const PartnerOrder = require("../../models/Partner/PartnerOrder");
const ItemDetail = require("../../models/Items/ItemDetail");
const { apiResponse } = require("../../utils/apiResponse");

// Utility to populate order fields
const populateOrder = (query) =>
  query
    .populate("partnerId", "name email")
    .populate("orderDetails.itemId", "name price")
    .populate("shippingAddressId", "address city state country postalCode")
    .populate("refund.pickupLocation", "address city state country postalCode");

// Create Order Controller
exports.createOrder = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const {
      orderDetails,
      invoice,
      shippingAddressId,
      paymentMethod,
      paymentStatus,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, "Invalid partnerId", null));
    }

    // Required fields check
    if (!orderDetails || !invoice || !invoice.key || !Array.isArray(invoice.values)) {
      return res.status(400).json(apiResponse(400, "orderDetails and invoice (with key and values) are required", null));
    }

    // Validate orderDetails array
    if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
      return res.status(400).json(apiResponse(400, "orderDetails must be a non-empty array", null));
    }

    // Validate each item
    for (const item of orderDetails) {
      if (!item.itemId || !mongoose.Types.ObjectId.isValid(item.itemId)) {
        return res.status(400).json(apiResponse(400, "Each item must have a valid itemId", null));
      }
      if (!item.color || !item.size || !item.skuId || !item.quantity || item.quantity < 1) {
        return res.status(400).json(apiResponse(400, "Color, size, skuId, and valid quantity are required for each item", null));
      }

      const itemDetail = await ItemDetail.findOne({ itemId: item.itemId });
      if (!itemDetail) {
        return res.status(404).json(apiResponse(404, `Item not found: ${item.itemId}`, null));
      }

      const colorEntry = itemDetail.imagesByColor.find(entry => entry.color === item.color);
      if (!colorEntry) {
        return res.status(400).json(apiResponse(400, `Color ${item.color} not found for itemId: ${item.itemId}`, null));
      }

      const sizeEntry = colorEntry.sizes.find(size => size.size === item.size && size.skuId === item.skuId);
      if (!sizeEntry) {
        return res.status(400).json(apiResponse(400, `Invalid size or skuId for itemId: ${item.itemId}`, null));
      }

      if (sizeEntry.stock < item.quantity) {
        return res.status(400).json(apiResponse(400, `Insufficient stock for itemId: ${item.itemId}, size: ${item.size}`, null));
      }

      // Reduce stock
      sizeEntry.stock -= item.quantity;
      await itemDetail.save();
    }

    // Validate shippingAddressId if provided
    if (shippingAddressId && !mongoose.Types.ObjectId.isValid(shippingAddressId)) {
      return res.status(400).json(apiResponse(400, "Invalid shippingAddressId", null));
    }

    // Validate payment method if provided
    if (paymentMethod && !["Online", "COD", "Wallet"].includes(paymentMethod)) {
      return res.status(400).json(apiResponse(400, "Payment method must be Online, COD, or Wallet", null));
    }

    // Validate payment status if provided
    if (paymentStatus && !["Pending", "Paid", "Failed", "Refunded"].includes(paymentStatus)) {
      return res.status(400).json(apiResponse(400, "Invalid payment status", null));
    }

    // Generate unique orderId
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Prepare orderData
    const orderData = {
      orderId,
      partnerId,
      orderDetails: orderDetails.map((item) => ({
        itemId: item.itemId,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        skuId: item.skuId,
      })),
      invoice: {
        key: invoice.key.trim().toLowerCase(),
        values: invoice.values,
      },
      shippingAddressId,
      paymentMethod,
      paymentStatus: paymentStatus || "Pending",
      isOrderPlaced: false,
      orderStatus: "In transit",
    };

    // Payment method-specific handling
    if (paymentMethod === "COD") {
      orderData.isOrderPlaced = true;
      orderData.orderStatus = "Confirmed";
      orderData.paymentStatus = "Pending";
      orderData.razorpayOrderId = null;
      orderData.razorpayPaymentId = null;
      orderData.razorpaySignature = null;
    } else if (paymentMethod === "Online") {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json(apiResponse(400, "Razorpay details are required for online payment", null));
      }
      orderData.razorpayOrderId = razorpayOrderId;
      orderData.razorpayPaymentId = razorpayPaymentId;
      orderData.razorpaySignature = razorpaySignature;
      orderData.paymentStatus = paymentStatus || "Paid";
      if (orderData.paymentStatus === "Paid") {
        orderData.isOrderPlaced = true;
        orderData.orderStatus = "Confirmed";
      }
    } else if (paymentMethod === "Wallet") {
      orderData.isOrderPlaced = true;
      orderData.orderStatus = "Confirmed";
      orderData.paymentStatus = paymentStatus || "Paid";
      orderData.razorpayOrderId = null;
      orderData.razorpayPaymentId = null;
      orderData.razorpaySignature = null;
    }

    // Create and save the order
    const newOrder = new PartnerOrder(orderData);
    const savedOrder = await newOrder.save();

    // Populate referenced fields
    const populatedOrder = await populateOrder(PartnerOrder.findById(savedOrder._id));

    return res.status(201).json(apiResponse(201, "Order created successfully", { order: populatedOrder }));
  } catch (error) {
    console.error("Error creating order:", error.message);
    return res.status(400).json(apiResponse(400, error.message || "Error while creating order", null));
  }
};

// Fetch All Partner Orders Controller
exports.fetchUserOrders = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, " WInvalid partnerId", null));
    }

    const orders = await PartnerOrder.find({ partnerId })
      .populate("orderDetails.itemId", "name description")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await PartnerOrder.countDocuments({ partnerId });

    return res.status(200).json(apiResponse(200, "Partner orders fetched successfully", {
      orders,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    }));
  } catch (error) {
    console.error("Error fetching partner orders:", error);
    return res.status(500).json(apiResponse(500, "Server error while fetching partner orders", null));
  }
};

// Fetch Confirmed Partner Orders Controller
exports.fetchConfirmedUserOrders = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { page = 1, limit = 10 } = req.query;

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, "Invalid partnerId", null));
    }

    // Fetch orders with orderStatus: "Confirmed"
    const orders = await PartnerOrder.find({ partnerId, orderStatus: "Confirmed" })
      .populate("orderDetails.itemId", "name description")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await PartnerOrder.countDocuments({ partnerId, orderStatus: "Confirmed" });

    return res.status(200).json(apiResponse(200, orders.length ? "Confirmed partner orders fetched successfully" : "No confirmed orders found", {
      orders,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    }));
  } catch (error) {
    console.error("Error fetching confirmed partner orders:", error);
    return res.status(500).json(apiResponse(500, "Server error while fetching confirmed partner orders", null));
  }
};

// Fetch Specific Order and All Partner Orders
exports.fetchOrderByOrderId = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, "Invalid partnerId", null));
    }

    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      return res.status(400).json(apiResponse(400, "Valid orderId is required", null));
    }

    const specificOrder = await populateOrder(PartnerOrder.findOne({ partnerId, orderId }));

    if (!specificOrder) {
      return res.status(404).json(apiResponse(404, "Order not found for this partner", null));
    }

    const allOrders = await populateOrder(
      PartnerOrder.find({ partnerId }).sort({ createdAt: -1 })
    );

    return res.status(200).json(apiResponse(200, "Order and partner orders fetched successfully", {
      specificOrder,
      allOrders,
    }));
  } catch (error) {
    console.error("Error fetching order and partner orders:", error);
    return res.status(500).json(apiResponse(500, "Server error while fetching order and partner orders", null));
  }
};

// Cancel Order Controller
exports.cancelOrder = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { orderId } = req.params;
    const { reason, bankDetails, pickupLocation, refundMethod } = req.body;

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, "Invalid partnerId", null));
    }

    // Validate orderId
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      return res.status(400).json(apiResponse(400, "Valid orderId is required", null));
    }

    // Validate reason
    if (!reason || typeof reason !== "string" || reason.trim() === "") {
      return res.status(400).json(apiResponse(400, "Reason for cancellation is required", null));
    }

    // Validate bankDetails
    if (!bankDetails || typeof bankDetails !== "object") {
      return res.status(400).json(apiResponse(400, "Bank details are required", null));
    }

    const { accountNumber, ifscCode, branchName, accountName } = bankDetails;
    if (
      !accountNumber || typeof accountNumber !== "string" || accountNumber.trim() === "" ||
      !ifscCode || typeof ifscCode !== "string" || ifscCode.trim() === "" ||
      !branchName || typeof branchName !== "string" || branchName.trim() === "" ||
      !accountName || typeof accountName !== "string" || accountName.trim() === ""
    ) {
      return res.status(400).json(apiResponse(400, "All bank details (accountNumber, ifscCode, branchName, accountName) must be non-empty strings", null));
    }

    // Validate pickupLocation and refundMethod
    if (!pickupLocation || !mongoose.Types.ObjectId.isValid(pickupLocation)) {
      return res.status(400).json(apiResponse(400, "Valid pickupLocation is required", null));
    }

    if (!refundMethod || !["Bank Transfer", "Original Payment Method"].includes(refundMethod)) {
      return res.status(400).json(apiResponse(400, "Valid refundMethod (Bank Transfer or Original Payment Method) is required", null));
    }

    // Find the order
    const order = await PartnerOrder.findOne({ partnerId, orderId });
    if (!order) {
      return res.status(404).json(apiResponse(404, "Order not found for this partner", null));
    }

    // Check if order is in a cancellable state
    const cancellableStatuses = ["In transit", "Initiated", "Confirmed", "Ready for Dispatch", "Dispatched"];
    if (!cancellableStatuses.includes(order.orderStatus)) {
      return res.status(400).json(apiResponse(400, `Order cannot be cancelled. Current status: ${order.orderStatus}`, null));
    }

    // Update order status to Cancelled
    order.orderStatus = "Cancelled";

    // Update refund and bank details
    order.refund.isRefundActive = true;
    order.refund.status = "Initiated";
    order.refund.requestDate = new Date();
    // Note: refund.amount to be calculated or provided by client if needed
    order.refund.reason = reason.trim();
    order.refund.pickupLocation = pickupLocation;
    order.refund.refundMethod = refundMethod;
    order.bankDetails = {
      accountNumber: accountNumber.trim(),
      ifscCode: ifscCode.trim(),
      branchName: branchName.trim(),
      accountName: accountName.trim(),
    };

    // Restore stock in ItemDetail
    for (const item of order.orderDetails) {
      const itemDetail = await ItemDetail.findOne({ itemId: item.itemId });
      if (!itemDetail) {
        return res.status(404).json(apiResponse(404, `ItemDetail not found for itemId: ${item.itemId}`, null));
      }

      const colorEntry = itemDetail.imagesByColor.find(entry => entry.color === item.color);
      if (!colorEntry) {
        return res.status(400).json(apiResponse(400, `Color ${item.color} not found for itemId: ${item.itemId}`, null));
      }

      const sizeEntry = colorEntry.sizes.find(size => size.size === item.size && size.skuId === item.skuId);
      if (!sizeEntry) {
        return res.status(400).json(apiResponse(400, `Size ${item.size} or skuId ${item.skuId} not found for color ${item.color}`, null));
      }

      // Restore stock based on ordered quantity
      sizeEntry.stock += item.quantity;
      await itemDetail.save();
    }

    // Save the updated order
    await order.save();

    // Populate referenced fields for response
    const populatedOrder = await populateOrder(PartnerOrder.findById(order._id));

    return res.status(200).json(apiResponse(200, "Order cancelled successfully", { order: populatedOrder }));
  } catch (error) {
    console.error("Error cancelling order:", error.message);
    return res.status(400).json(apiResponse(400, error.message || "Error while cancelling order", null));
  }
};

// Exchange/Return Orders Controller
exports.exchangeOrders = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { orders } = req.body;

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, "Invalid partnerId", null));
    }

    // Validate orders array
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json(apiResponse(400, "Orders must be a non-empty array", null));
    }

    const results = [];
    const errors = [];

    // Process each order
    for (const orderData of orders) {
      const {
        orderId,
        itemIndex,
        exchangeType, // "Exchange" or "Return"
        reason,
        specificReason,
        color,
        size,
        skuId,
        pickupLocation,
        refundMethod,
      } = orderData;

      try {
        // Validate orderId
        if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
          errors.push({ orderId, message: "Valid orderId is required" });
          continue;
        }

        // Validate exchangeType
        if (!exchangeType || !["Exchange", "Return"].includes(exchangeType)) {
          errors.push({ orderId, message: "Valid exchangeType (Exchange or Return) is required" });
          continue;
        }

        // Validate reason
        if (
          !reason ||
          ![
            "Size too small",
            "Size too big",
            "Don't like the fit",
            "Don't like the quality",
            "Not same as the catalogue",
            "Product is damaged",
            "Wrong product is received",
            "Product arrived too late",
          ].includes(reason)
        ) {
          errors.push({ orderId, message: "Valid reason is required" });
          continue;
        }

        // Validate specificReason
        if (!specificReason || typeof specificReason !== "string" || specificReason.trim() === "") {
          errors.push({ orderId, message: "Specific reason is required" });
          continue;
        }

        // Find the order
        const order = await PartnerOrder.findOne({ partnerId, orderId });
        if (!order) {
          errors.push({ orderId, message: "Order not found for this partner" });
          continue;
        }

        // Check if order is in a valid state
        const validStatuses = ["Confirmed", "Delivered"];
        if (!validStatuses.includes(order.orderStatus)) {
          errors.push({ orderId, message: `Order cannot be processed. Current status: ${order.orderStatus}` });
          continue;
        }

        if (exchangeType === "Return") {
          // Validate pickupLocation and refundMethod for return
          if (!pickupLocation || !mongoose.Types.ObjectId.isValid(pickupLocation)) {
            errors.push({ orderId, message: "Valid pickupLocation is required for return" });
            continue;
          }

          if (!refundMethod || !["Bank Transfer", "Original Payment Method"].includes(refundMethod)) {
            errors.push({ orderId, message: "Valid refundMethod (Bank Transfer or Original Payment Method) is required" });
            continue;
          }

          // Handle return case (update refund field)
          order.refund.isRefundActive = true;
          order.refund.requestDate = new Date();
          order.refund.status = "Initiated";
          // Note: refund.amount to be provided by client if needed
          order.refund.reason = reason;
          order.refund.pickupLocation = pickupLocation;
          order.refund.refundMethod = refundMethod;
          order.refund.refundStatus = "Initiated";
        } else if (exchangeType === "Exchange") {
          // Validate itemIndex
          if (typeof itemIndex !== "number" || itemIndex < 0 || itemIndex >= order.orderDetails.length) {
            errors.push({ orderId, message: "Valid itemIndex is required to identify the item being exchanged" });
            continue;
          }

          // Validate new item details (color, size, skuId)
          if (!color || typeof color !== "string" || color.trim() === "") {
            errors.push({ orderId, message: "Color is required for exchange" });
            continue;
          }

          if (!size || typeof size !== "string" || size.trim() === "") {
            errors.push({ orderId, message: "Size is required for exchange" });
            continue;
          }

          if (!skuId || typeof skuId !== "string" || skuId.trim() === "") {
            errors.push({ orderId, message: "Valid skuId is required for exchange" });
            continue;
          }

          // Get the item being exchanged from orderDetails
          const originalItem = order.orderDetails[itemIndex];
          const itemId = originalItem.itemId;

          // Validate new item details against ItemDetail
          const itemDetail = await ItemDetail.findOne({ itemId });
          if (!itemDetail) {
            errors.push({ orderId, message: `ItemDetail not found for itemId: ${itemId}` });
            continue;
          }

          const colorEntry = itemDetail.imagesByColor.find(
            (entry) => entry.color.trim().toLowerCase() === color.trim().toLowerCase()
          );
          if (!colorEntry) {
            errors.push({ orderId, message: `Color ${color} not available for itemId: ${itemId}` });
            continue;
          }

          const sizeEntry = colorEntry.sizes.find(
            (s) => s.size.trim() === size.trim() && s.skuId.trim() === skuId.trim()
          );
          if (!sizeEntry) {
            errors.push({ orderId, message: `Size ${size} or skuId ${skuId} not available for color ${color} in itemId: ${itemId}` });
            continue;
          }

          // Check stock availability for the new size
          if (sizeEntry.stock <= 0) {
            order.orderStatus = "Returned";
            errors.push({ orderId, message: `New size ${size} with skuId ${skuId} is out of stock for itemId: ${itemId}` });
            await order.save();
            continue;
          }

          // Update order status for exchange
          order.orderStatus = "Initiated";

          // Update refund fields for exchange
          order.refund.isRefundActive = false;
          order.refund.requestDate = null;
          order.refund.status = "Pending";
          order.refund.amount = null;
          order.refund.reason = null;
          order.refund.pickupLocation = null;
          order.refund.refundMethod = null;
          order.refund.refundStatus = null;
        }

        // Save the updated order
        await order.save();

        // Populate referenced fields for response
        const populatedOrder = await populateOrder(PartnerOrder.findById(order._id));

        results.push({ orderId, order: populatedOrder });
      } catch (error) {
        errors.push({ orderId, message: error.message });
      }
    }

    // Prepare response
    if (errors.length > 0 && results.length === 0) {
      return res.status(400).json(apiResponse(400, "All orders failed to process", { errors }));
    }

    const response = {
      results,
      errors: errors.length > 0 ? errors : undefined,
    };

    return res.status(200).json(apiResponse(200, "Orders processed successfully", response));
  } catch (error) {
    console.error("Error initiating exchange/return:", error.message);
    return res.status(400).json(apiResponse(400, error.message || "Error while initiating exchange/return", null));
  }
};