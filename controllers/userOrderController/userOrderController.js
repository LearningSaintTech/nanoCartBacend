const mongoose = require("mongoose");
const UserOrder = require("../../models/User/UserOrder");
const ItemDetail = require("../../models/Items/ItemDetail");
const UserAddress = require("../../models/User/UserAddress");
const { apiResponse } = require("../../utils/apiResponse");

// Utility to populate order fields
const populateOrder = (query) =>
  query
    .populate("userId", "name email")
    .populate("orderDetails.itemId", "name price")
    exports.createOrder = async (req, res) => {
      try {
        const { userId } = req.user;
        const {
          orderDetails,
          invoice,
          shippingAddressId,
          paymentMethod,
          totalAmount,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
        } = req.body;
        console.log(shippingAddressId)
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
          if (!entry.key || typeof entry.key !== "string" || entry.key.trim() === "") {
            return res
              .status(400)
              .json(apiResponse(400, "Each invoice entry must have a valid key", null));
          }
          if (entry.value === undefined || entry.value === null || entry.value.toString().trim() === "") {
            return res
              .status(400)
              .json(apiResponse(400, "Each invoice entry must have a valid value", null));
          }
        }
    
        // Validate totalAmount
        if (typeof totalAmount !== "number" || totalAmount <= 0) {
          return res
            .status(400)
            .json(apiResponse(400, "Valid totalAmount is required and must be positive", null));
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
          if (!item.color || !item.size || !item.skuId || !item.quantity || item.quantity < 1) {
            return res
              .status(400)
              .json(
                apiResponse(400, "Color, size, skuId, and valid quantity are required for all items", null)
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
            "addressDetail._id": shippingAddressId
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
            isItemExchange: false
          })),
          invoice: invoice.map(entry => ({
            key: entry.key.trim().toLowerCase(),
            value: entry.value.toString().trim()
          })),
          shippingAddressId:shippingAddressId,
          paymentMethod,
          isOrderPlaced: false,
          totalAmount,
          orderStatus: "Initiated",
          paymentStatus: "Pending",
          razorpayOrderId: null,
          razorpayPaymentId: null,
          razorpaySignature: null,
          refund: [],
          exchange: [],
          isOrderCancelled: false
        };
    
        // Handle payment method-specific logic
        if (paymentMethod === "COD") {
          orderData.isOrderPlaced = true;
          orderData.orderStatus = "Confirmed";
          orderData.paymentStatus = "Pending"; // COD is pending until delivery
        } else if (paymentMethod === "Online") {
          // Validate online payment fields
          if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res
              .status(400)
              .json(
                apiResponse(
                  400,
                  "All Razorpay details are required for online payment",
                  null
                )
              );
          }
          orderData.razorpayOrderId = razorpayOrderId;
          orderData.razorpayPaymentId = razorpayPaymentId;
          orderData.razorpaySignature = razorpaySignature;
          orderData.paymentStatus = "Paid";
          orderData.isOrderPlaced = true;
          orderData.orderStatus = "Confirmed";
        }
    
        // Create new order
        const newOrder = new UserOrder(orderData);
    
        // Save the order
        const savedOrder = await newOrder.save();
    
        // Populate referenced fields for response
        const populatedOrder = await populateOrder(UserOrder.findById(savedOrder._id));
    
        return res.status(201).json(
          apiResponse(201, "Order created successfully", {
            order: populatedOrder,
          })
        );
      } catch (error) {
        console.error("Error creating order:", error.message);
        return res
          .status(400)
          .json(apiResponse(400, error.message || "Error while creating order", null));
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

    // Fetch orders and populate referenced fields
    const orders = await UserOrder.find({ userId })
      .populate("orderDetails.itemId", "name description")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await UserOrder.countDocuments({ userId });

    // Prepare response data
    const responseData = {
      orders,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    };

    return res
      .status(200)
      .json(apiResponse(200, "User orders fetched successfully", responseData));
  } catch (error) {
    console.error("Error fetching user orders:", error);
    return res
      .status(500)
      .json(apiResponse(500, "Server error while fetching user orders", null));
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

    const total = await UserOrder.countDocuments({ userId, orderStatus: "Confirmed" });

    // Optional: Handle no orders
    if (orders.length === 0) {
      return res.status(200).json(
        apiResponse(200, "No confirmed orders found", {
          orders: [],
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
        })
      );
    }

    // Send response
    return res
      .status(200)
      .json(apiResponse(200, "Confirmed user orders fetched successfully", {
        orders,
        pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
      }));
  } catch (error) {
    console.error("Error fetching confirmed user orders:", error);
    return res
      .status(500)
      .json(apiResponse(500, "Server error while fetching confirmed user orders", null));
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
    const specificOrder = await populateOrder(UserOrder.findOne({ userId, orderId }));

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

// Cancel Orders Controller
exports.cancelOrders = async (req, res) => {
  try {
    const { userId } = req.user;
    const { orderId, reason, bankDetails, itemsId } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Validate reason
    if (!reason || typeof reason !== "string" || reason.trim() === "") {
      return res.status(400).json(apiResponse(400, "Reason for cancellation is required", null));
    }

    // Validate itemsId
    let itemsToCancel = null;
    if (itemsId) {
      if (!Array.isArray(itemsId) || itemsId.length === 0) {
        return res.status(400).json(apiResponse(400, "itemsId must be a non-empty array or null", null));
      }
      for (const itemId of itemsId) {
        if (!mongoose.Types.ObjectId.isValid(itemId)) {
          return res.status(400).json(apiResponse(400, `Invalid itemId: ${itemId}`, null));
        }
      }
      itemsToCancel = itemsId.map(id => new mongoose.Types.ObjectId(id));
    }

    const results = [];
    const errors = [];

    // Find the order
    const order = await UserOrder.findOne({ userId, orderId });
    if (!order) {
      return res.status(404).json(apiResponse(404, "Order not found for this user", null));
    }

    // Check if order is in a cancellable state
    const cancellableStatuses = ["Initiated", "Confirmed", "Ready for Dispatch", "Dispatched"];
    if (!cancellableStatuses.includes(order.orderStatus)) {
      return res.status(400).json(apiResponse(400, `Order cannot be cancelled. Current status: ${order.orderStatus}`, null));
    }

    // Validate bankDetails based on paymentMethod
    if (order.paymentMethod === "COD") {
      if (!bankDetails || typeof bankDetails !== "object") {
        return res.status(400).json(apiResponse(400, "Bank details are required for COD orders", null));
      }
      const { accountNumber, ifscCode, branchName, accountName } = bankDetails;
      if (
        !accountNumber || typeof accountNumber !== "string" || accountNumber.trim() === "" ||
        !ifscCode || typeof ifscCode !== "string" || ifscCode.trim() === "" ||
        !branchName || typeof branchName !== "string" || branchName.trim() === "" ||
        !accountName || typeof accountName !== "string" || accountName.trim() === ""
      ) {
        return res.status(400).json(apiResponse(400, "All bank details (accountNumber, ifscCode, branchName, accountName) must be non-empty strings for COD orders", null));
      }
    } else if (order.paymentMethod === "Online") {
      if (bankDetails !== null) {
        return res.status(400).json(apiResponse(400, "Bank details must be null for Online payment orders", null));
      }
    } else {
      return res.status(400).json(apiResponse(400, "Invalid paymentMethod", null));
    }

    // Validate itemsId against orderDetails
    const itemsToProcess = [];
    if (itemsToCancel) {
      for (const itemId of itemsToCancel) {
        const item = order.orderDetails.find(detail => detail.itemId.equals(itemId));
        if (!item) {
          errors.push({ orderId, message: `ItemId ${itemId} not found in order` });
          continue;
        }
        if (item.isItemCancel) {
          errors.push({ orderId, message: `ItemId ${itemId} is already canceled` });
          continue;
        }
        itemsToProcess.push(item);
      }
    } else {
      for (const item of order.orderDetails) {
        if (item.isItemCancel) {
          errors.push({ orderId, message: `ItemId ${item.itemId} is already canceled` });
          continue;
        }
        itemsToProcess.push(item);
      }
    }

    if (itemsToProcess.length === 0) {
      return res.status(400).json(apiResponse(400, "No valid items to cancel", { errors }));
    }

    // Calculate base amounts
    if (typeof order.totalAmount !== "number" || order.totalAmount < 0) {
      return res.status(400).json(apiResponse(400, "Invalid or missing totalAmount", null));
    }
    const shippingInvoice = order.invoice.find(entry => entry.key.trim().toLowerCase() === "shippingcharge");
    const shippingCharge = shippingInvoice && shippingInvoice.value !== "0" && shippingInvoice.value.toLowerCase() !== "free" ? parseFloat(shippingInvoice.value || 0) : 0;
    if (isNaN(shippingCharge)) {
      return res.status(400).json(apiResponse(400, "Invalid shipping charge in invoice", null));
    }
    const gstInvoice = order.invoice.find(entry => entry.key.trim().toLowerCase() === "gst");
    const gst = gstInvoice ? parseFloat(gstInvoice.value || 0) : 0;
    if (isNaN(gst)) {
      return res.status(400).json(apiResponse(400, "Invalid GST in invoice", null));
    }

    // Update order details and refund
    const isAllItems = itemsToProcess.length === order.orderDetails.length;
    let totalRefundAmount = 0;

    for (const item of itemsToProcess) {
      // Calculate refund amount
      let refundAmount;
      if (isAllItems) {
        refundAmount = (order.totalAmount - (gst + shippingCharge)) / order.orderDetails.length;
      } else {
        refundAmount = (order.totalAmount / order.orderDetails.length) - (gst + shippingCharge);
      }
      refundAmount = Math.max(0, refundAmount);

      // Update orderDetails
      item.isItemCancel = true;

      // Add to refund array
      const refundEntry = {
        itemId: item.itemId,
        refundReason: reason.trim(),
        requestDate: new Date(),
        refundAmount,
        refundStatus: "Initiated",
        bankDetails: order.paymentMethod === "COD" ? {
          accountNumber: bankDetails.accountNumber.trim(),
          ifscCode: bankDetails.ifscCode.trim(),
          branchName: bankDetails.branchName.trim(),
          accountName: bankDetails.accountName.trim(),
        } : null
      };
      order.refund.push(refundEntry);
      totalRefundAmount += refundAmount;

      // Restore stock in ItemDetail
      const itemDetail = await ItemDetail.findOne({ itemId: item.itemId });
      if (!itemDetail) {
        errors.push({ orderId, message: `ItemDetail not found for itemId: ${item.itemId}` });
        continue;
      }

      const colorEntry = itemDetail.imagesByColor.find(entry => entry.color === item.color);
      if (!colorEntry) {
        errors.push({ orderId, message: `Color ${item.color} not found for itemId: ${item.itemId}` });
        continue;
      }

      const sizeEntry = colorEntry.sizes.find(size => size.size === item.size && size.skuId === item.skuId);
      if (!sizeEntry) {
        errors.push({ orderId, message: `Size ${item.size} or skuId ${item.skuId} not found for color ${item.color}` });
        continue;
      }

      sizeEntry.stock += item.quantity;
      await itemDetail.save();
    }

    // Update order status
    if (isAllItems) {
      order.isOrderCancelled = true;
      order.orderStatus = "Cancelled";
    }

    // Save the updated order
    await order.save();

    // Populate referenced fields for response
    const populatedOrder = await populateOrder(UserOrder.findById(order._id));

    results.push({ orderId, order: populatedOrder });

    // Prepare response
    if (errors.length > 0 && results.length === 0) {
      return res.status(400).json(apiResponse(400, "Order failed to cancel", { errors }));
    }

    const response = {
      results,
      errors: errors.length > 0 ? errors : undefined,
    };

    return res.status(200).json(apiResponse(200, "Order cancellation processed", response));
  } catch (error) {
    console.error("Error cancelling order:", error.message);
    return res.status(400).json(apiResponse(400, error.message || "Error while cancelling order", null));
  }
};


// Exchange/Return Orders Controller
exports.exchangeOrders = async (req, res) => {
  try {
    const { userId } = req.user;
    const { orders } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
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
        itemsId,
        isReturnRefund,
        isExchange,
        reason,
        specificReason,
        color,
        size,
        pickupLocationId,
        bankDetails,
      } = orderData;

      try {
        // Validate orderId
        if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
          errors.push({ orderId, message: "Valid orderId is required" });
          continue;
        }

        // Validate isReturnRefund and isExchange
        if (isReturnRefund === undefined || isExchange === undefined) {
          errors.push({ orderId, message: "isReturnRefund and isExchange are required" });
          continue;
        }
        if (typeof isReturnRefund !== "boolean" || typeof isExchange !== "boolean") {
          errors.push({ orderId, message: "isReturnRefund and isExchange must be booleans" });
          continue;
        }
        if (isReturnRefund && isExchange) {
          errors.push({ orderId, message: "Only one of isReturnRefund or isExchange can be true" });
          continue;
        }
        if (!isReturnRefund && !isExchange) {
          errors.push({ orderId, message: "One of isReturnRefund or isExchange must be true" });
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

        // Validate pickupLocationId
        if (!pickupLocationId || !mongoose.Types.ObjectId.isValid(pickupLocationId)) {
          errors.push({ orderId, message: "Valid pickupLocationId is required" });
          continue;
        }
        const pickupAddressExists = await UserAddress.findOne({
          userId,
          "addressDetail._id": pickupLocationId
        });
        if (!pickupAddressExists) {
          errors.push({ orderId, message: "Pickup address not found" });
          continue;
        }

        // Find the order
        const order = await UserOrder.findOne({ userId, orderId });
        if (!order) {
          errors.push({ orderId, message: "Order not found for this user" });
          continue;
        }

        // Check if order is in a valid state
        const validStatuses = ["Confirmed", "Delivered"];
        if (!validStatuses.includes(order.orderStatus)) {
          errors.push({ orderId, message: `Order cannot be processed. Current status: ${order.orderStatus}` });
          continue;
        }

        // Validate itemsId
        let itemsToProcess = [];
        if (itemsId) {
          if (!Array.isArray(itemsId) || itemsId.length === 0) {
            errors.push({ orderId, message: "itemsId must be a non-empty array or null" });
            continue;
          }
          for (const itemId of itemsId) {
            if (!mongoose.Types.ObjectId.isValid(itemId)) {
              errors.push({ orderId, message: `Invalid itemId: ${itemId}` });
              continue;
            }
            const item = order.orderDetails.find(detail => detail.itemId.equals(itemId));
            if (!item) {
              errors.push({ orderId, message: `ItemId ${itemId} not found in order` });
              continue;
            }
            if (item.isItemExchange || item.isItemCancel) {
              errors.push({ orderId, message: `ItemId ${itemId} is already canceled or exchanged` });
              continue;
            }
            itemsToProcess.push(item);
          }
        } else {
          for (const item of order.orderDetails) {
            if (item.isItemExchange || item.isItemCancel) {
              errors.push({ orderId, message: `ItemId ${item.itemId} is already canceled or exchanged` });
              continue;
            }
            itemsToProcess.push(item);
          }
        }

        if (itemsToProcess.length === 0) {
          errors.push({ orderId, message: "No valid items to process" });
          continue;
        }

        // Calculate base amounts
        if (typeof order.totalAmount !== "number" || order.totalAmount < 0) {
          errors.push({ orderId, message: "Invalid or missing totalAmount" });
          continue;
        }
        const shippingInvoice = order.invoice.find(entry => entry.key.trim().toLowerCase() === "shippingcharge");
        const shippingCharge = shippingInvoice && shippingInvoice.value !== "0" && shippingInvoice.value.toLowerCase() !== "free" ? parseFloat(shippingInvoice.value || 0) : 0;
        if (isNaN(shippingCharge)) {
          errors.push({ orderId, message: "Invalid shipping charge in invoice" });
          continue;
        }
        const gstInvoice = order.invoice.find(entry => entry.key.trim().toLowerCase() === "gst");
        const gst = gstInvoice ? parseFloat(gstInvoice.value || 0) : 0;
        if (isNaN(gst)) {
          errors.push({ orderId, message: "Invalid GST in invoice" });
          continue;
        }

        const isAllItems = itemsToProcess.length === order.orderDetails.length;

        if (isReturnRefund) {
          // Validate bankDetails based on paymentMethod
          if (order.paymentMethod === "COD") {
            if (!bankDetails || typeof bankDetails !== "object") {
              errors.push({ orderId, message: "Bank details are required for COD orders" });
              continue;
            }
            const { accountNumber, ifscCode, branchName, accountName } = bankDetails;
            if (
              !accountNumber || typeof accountNumber !== "string" || accountNumber.trim() === "" ||
              !ifscCode || typeof ifscCode !== "string" || ifscCode.trim() === "" ||
              !branchName || typeof branchName !== "string" || branchName.trim() === "" ||
              !accountName || typeof accountName !== "string" || accountName.trim() === ""
            ) {
              errors.push({ orderId, message: "All bank details (accountNumber, ifscCode, branchName, accountName) must be non-empty strings for COD orders" });
              continue;
            }
          } else if (order.paymentMethod === "Online") {
            if (bankDetails !== null) {
              errors.push({ orderId, message: "Bank details must be null for Online payment orders" });
              continue;
            }
          } else {
            errors.push({ orderId, message: "Invalid paymentMethod" });
            continue;
          }

          for (const item of itemsToProcess) {
            // Calculate refund amount
            let refundAmount;
            if (isAllItems) {
              refundAmount = (order.totalAmount - (gst + shippingCharge)) / order.orderDetails.length;
            } else {
              refundAmount = (order.totalAmount / order.orderDetails.length) - (gst + shippingCharge);
            }
            refundAmount = Math.max(0, refundAmount);

            // Update orderDetails
            item.isItemCancel = true;

            // Add to refund array
            const refundEntry = {
              itemId: item.itemId,
              refundReason: reason.trim(),
              requestDate: new Date(),
              refundAmount,
              refundStatus: "Initiated",
              bankDetails: order.paymentMethod === "COD" ? {
                accountNumber: bankDetails.accountNumber.trim(),
                ifscCode: bankDetails.ifscCode.trim(),
                branchName: bankDetails.branchName.trim(),
                accountName: bankDetails.accountName.trim(),
              } : null
            };
            order.refund.push(refundEntry);

            // Add to exchange array for return
            const exchangeEntry = {
              itemId: item.itemId,
              isReturnRefund: true,
              isExchange: false,
              requestDate: new Date(),
              exchangeReason: reason,
              exchangeSpecificReason: specificReason.trim(),
              color: null,
              size: null,
              skuId: null,
              isSizeAvailability: false,
              pickupLocationId
            };
            order.exchange.push(exchangeEntry);

            // Restore stock
            const itemDetail = await ItemDetail.findOne({ itemId: item.itemId });
            if (!itemDetail) {
              errors.push({ orderId, message: `ItemDetail not found for itemId: ${item.itemId}` });
              continue;
            }

            const colorEntry = itemDetail.imagesByColor.find(entry => entry.color === item.color);
            if (!colorEntry) {
              errors.push({ orderId, message: `Color ${item.color} not found for itemId: ${item.itemId}` });
              continue;
            }

            const sizeEntry = colorEntry.sizes.find(size => size.size === item.size);
            if (!sizeEntry) {
              errors.push({ orderId, message: `Size ${item.size} or skuId ${item.skuId} not found for color ${item.color}` });
              continue;
            }

            sizeEntry.stock += item.quantity;
            await itemDetail.save();
          }

          if (isAllItems) {
            order.isOrderCancelled = true;
            order.orderStatus = "Cancelled";
          }
        } else if (isExchange) {
          // Validate exchange details
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

          for (const item of itemsToProcess) {
            const itemId = item.itemId;

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

            // Check stock availability
            const isSizeAvailable = sizeEntry.stock > 0;

            // Update orderDetails
            item.isItemExchange = true;

            // Add to exchange array
            const exchangeEntry = {
              itemId,
              isReturnRefund: false,
              isExchange: true,
              requestDate: new Date(),
              exchangeReason: reason,
              exchangeSpecificReason: specificReason.trim(),
              color,
              size,
              skuId,
              isSizeAvailability: isSizeAvailable,
              pickupLocationId
            };
            order.exchange.push(exchangeEntry);

            // Update order status and handle refunds for unavailable sizes
            if (!isSizeAvailable) {
              order.orderStatus = "Returned";
              // Add to refund array
              let refundAmount;
              if (isAllItems) {
                refundAmount = (order.totalAmount - (gst + shippingCharge)) / order.orderDetails.length;
              } else {
                refundAmount = (order.totalAmount / order.orderDetails.length) - (gst + shippingCharge);
              }
              refundAmount = Math.max(0, refundAmount);

              const refundEntry = {
                itemId,
                refundReason: `Size ${size} unavailable for exchange`,
                requestDate: new Date(),
                refundAmount,
                refundStatus: "Initiated",
                bankDetails: order.paymentMethod === "COD" ? {
                  accountNumber: bankDetails.accountNumber.trim(),
                  ifscCode: bankDetails.ifscCode.trim(),
                  branchName: bankDetails.branchName.trim(),
                  accountName: bankDetails.accountName.trim(),
                } : null
              };
              order.refund.push(refundEntry);
            } else {
              order.orderStatus = "Initiated";
            }
          }
        }

        // Save the updated order
        await order.save();

        // Populate referenced fields for response
        const populatedOrder = await populateOrder(UserOrder.findById(order._id));

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