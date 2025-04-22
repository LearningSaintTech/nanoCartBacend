const mongoose = require("mongoose");
const UserOrder = require("../../models/User/UserOrder");
const ItemDetail = require("../../models/Items/ItemDetail");
const { apiResponse } = require("../../utils/apiResponse");

// Create Order Controller
exports.createOrder = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      itemDescription,
      invoiceId,
      totalPrice,
      shippingAddressId,
      paymentMethod,
      walletId,
      paymentStatus,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;
    console.log("111",shippingAddressId)

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Validate required fields for all orders
    if (!itemDescription || !invoiceId || !totalPrice) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "ItemDescription, invoiceId, and totalPrice are required",
            null
          )
        );
    }

    // Validate invoiceId
    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json(apiResponse(400, "Invalid invoiceId", null));
    }

    // Validate items array
    if (!Array.isArray(itemDescription) || itemDescription.length === 0) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "ItemDescription array is required and cannot be empty",
            null
          )
        );
    }

    // Validate each item in the items array and check against ItemDetail
    for (const item of itemDescription) {
      // Validate itemId
      if (!item.itemId || !mongoose.Types.ObjectId.isValid(item.itemId)) {
        return res
          .status(400)
          .json(
            apiResponse(400, "Valid itemId is required for all items", null)
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
        (entry) => entry.color === item.color
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
      if (sizeEntry.stock <= 0) {
        return res
          .status(400)
          .json(
            apiResponse(
              400,
              `Item with size ${item.size} and skuId ${item.skuId} is out of stock for itemId: ${item.itemId}`,
              null
            )
          );
      }
    }

    // Validate shippingAddressId if provided
    if (
      shippingAddressId &&
      !mongoose.Types.ObjectId.isValid(shippingAddressId)
    ) {
      return res
        .status(400)
        .json(apiResponse(400, "Invalid shippingAddressId"));
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

    // Validate payment status if provided
    if (
      paymentStatus &&
      !["Pending", "Paid", "Failed", "Refunded"].includes(paymentStatus)
    ) {
      return res
        .status(400)
        .json(apiResponse(400, "Invalid payment status", null));
    }

    // Generate unique orderId
    const orderId = `ORD-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Initialize order data
    const orderData = {
      orderId,
      userId,
      itemDescription: itemDescription.map((item) => ({
        itemId: item.itemId,
        color: item.color,
        size: item.size,
        skuId: item.skuId,
      })),
      invoiceId,
      totalPrice,
      walletId,
      shippingAddressId,
      paymentMethod,
      paymentStatus: paymentStatus || "Pending",
      isOrderPlaced: false,
      orderStatus: "Initiated",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Set expiration to 24 hours
    };

    console.log("11112222221111111",shippingAddressId)


    // Handle payment method-specific logic
    if (paymentMethod === "COD") {
      orderData.isOrderPlaced = true;
      orderData.orderStatus = "Confirmed";
      orderData.paymentStatus = "Pending";
      orderData.razorpayOrderId = null;
      orderData.razorpayPaymentId = null;
      orderData.razorpaySignature = null;
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
      orderData.paymentStatus = paymentStatus || "Paid";
      if (orderData.paymentStatus === "Paid") {
        orderData.isOrderPlaced = true;
        orderData.orderStatus = "Confirmed";
      }
    }

    // Create new order
    const newOrder = new UserOrder(orderData);

    // Save the order
    const savedOrder = await newOrder.save();

    // Populate referenced fields for response
    const populatedOrder = await UserOrder.findById(savedOrder._id)
      .populate("userId", "name email")
      .populate("itemDescription.itemId", "name price")
      // .populate("shippingAddressId", "address city state country postalCode")
      .populate("invoiceId", "couponDiscount GST shippingCharge");

    return res.status(201).json(
      apiResponse(201, "Order created successfully", {
        order: populatedOrder,
      })
    );
  } catch (error) {
    console.error("Error creating order:", error.message);
    return res
      .status(500)
      .json(apiResponse(500, "Server error while creating order", null));
  }
};

// Fetch All User Orders Controller
exports.fetchUserOrders = async (req, res) => {
  try {
    const { userId } = req.user;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Fetch orders and populate referenced fields
    const orders = await UserOrder.find({ userId })
      .populate("itemDescription.itemId", "name description")
      .sort({ createdAt: -1 }); // Sort by newest first

    // Prepare response data
    const responseData = { orders };

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

exports.fetchConfirmedUserOrders = async (req, res) => {
  try {
    const { userId } = req.user;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Fetch orders with orderStatus: "Confirmed" and populate referenced fields
    const orders = await UserOrder.find({ userId, orderStatus: "Confirmed" })
      .populate("itemDescription.itemId", "name description")
      .sort({ createdAt: -1 }); // Sort by newest first

    // Prepare response data
    const responseData = { orders };

    return res
      .status(200)
      .json(
        apiResponse(
          200,
          "Confirmed user orders fetched successfully",
          responseData
        )
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
    const { orderId } = req.params; // Assuming orderId is passed as a query parameter

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
    const specificOrder = await UserOrder.findOne({ userId, orderId })
      .populate("userId", "name email")
      .populate("itemDescription.itemId", "name price")
      .populate("shippingAddressId", "address city state country postalCode")
      .populate("invoiceId", "couponDiscount GST shippingCharge");

    // If specific order not found, return 404
    if (!specificOrder) {
      return res
        .status(404)
        .json(apiResponse(404, "Order not found for this user", null));
    }

    // Fetch all orders for the user
    const allOrders = await UserOrder.find({ userId })
      .populate("userId", "name email")
      .populate("itemDescription.itemId", "name price")
      .populate("shippingAddressId", "address city state country postalCode")
      .populate("invoiceId", "couponDiscount GST shippingCharge")
      .sort({ createdAt: -1 }); // Sort by newest first

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
    const { orderIds, reason, bankDetails } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Validate orderIds
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json(apiResponse(400, "orderIds must be a non-empty array", null));
    }

    for (const orderId of orderIds) {
      if (typeof orderId !== "string" || orderId.trim() === "") {
        return res.status(400).json(apiResponse(400, `Invalid orderId: ${orderId}`, null));
      }
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

    const results = [];
    const errors = [];

    // Process each order
    for (const orderId of orderIds) {
      try {
        // Find the order
        const order = await UserOrder.findOne({ userId, orderId });
        if (!order) {
          errors.push({ orderId, message: "Order not found for this user" });
          continue;
        }

        // Check if order is in a cancellable state
        const cancellableStatuses = ["Initiated", "Confirmed", "Ready for Dispatch", "Dispatched"];
        if (!cancellableStatuses.includes(order.orderStatus)) {
          errors.push({ orderId, message: `Order cannot be cancelled. Current status: ${order.orderStatus}` });
          continue;
        }

        // Update order status to Cancelled
        order.orderStatus = "Cancelled";

        // Update refund and bank details
        order.refund.isRefundActive = true;
        order.refund.status = "Initiated";
        order.refund.requestDate = new Date();
        order.refund.amount = order.totalPrice;
        order.refund.reason = reason.trim();
        order.BankDetails = {
          accountNumber: accountNumber.trim(),
          ifscCode: ifscCode.trim(),
          branchName: branchName.trim(),
          accountName: accountName.trim(),
        };

        // Restore stock in ItemDetail
        for (const item of order.itemDescription) {
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

          // Increment stock (assuming 1 unit per item in order)
          sizeEntry.stock += 1;
          await itemDetail.save();
        }

        // Save the updated order
        await order.save();

        // Populate referenced fields for response
        const populatedOrder = await UserOrder.findById(order._id)
          .populate("userId", "name email")
          .populate("itemDescription.itemId", "name price")
          .populate("shippingAddressId", "address city state country postalCode")
          .populate("invoiceId", "couponDiscount GST shippingCharge");

        results.push({ orderId, order: populatedOrder });
      } catch (error) {
        errors.push({ orderId, message: error.message });
      }
    }

    // Prepare response
    if (errors.length > 0 && results.length === 0) {
      return res.status(400).json(apiResponse(400, "All orders failed to cancel", { errors }));
    }

    const response = {
      results,
      errors: errors.length > 0 ? errors : undefined,
    };

    return res.status(200).json(apiResponse(200, "Order cancellation processed", response));
  } catch (error) {
    console.error("Error cancelling orders:", error.message);
    return res.status(500).json(apiResponse(500, "Server error while cancelling orders", null));
  }
};

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
        reason,
        specificReason,
        newItemId,
        color,
        size,
        skuId,
        isExchange,
        isReturn,
      } = orderData;

      try {
        // Validate orderId
        if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
          errors.push({ orderId, message: "Valid orderId is required" });
          continue;
        }

        // Validate that only one of isExchange or isReturn is true
        if (isExchange && isReturn) {
          errors.push({ orderId, message: "Only one of isExchange or isReturn can be true" });
          continue;
        }

        if (!isExchange && !isReturn) {
          errors.push({ orderId, message: "Either isExchange or isReturn must be true" });
          continue;
        }

        // Validate reason
        if (!reason || !["Size too small", "Size too big", "Don't like the fit", "Don't like the quality", "Not same as the catalogue", "Product is damaged", "Wrong product is received", "Product arrived too late"].includes(reason)) {
          errors.push({ orderId, message: "Valid reason is required" });
          continue;
        }

        // Validate specificReason
        if (!specificReason || typeof specificReason !== "string" || specificReason.trim() === "") {
          errors.push({ orderId, message: "Specific reason is required" });
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

        if (isReturn) {
          // Handle return case (update refund field)
          order.refund.isRefundActive = true;
          order.refund.requestDate = new Date();
          order.refund.status = "Initiated";
          order.refund.amount = order.totalPrice;
          order.refund.reason = reason;
          order.exchange.isExchange = false;
          order.exchange.isReturn = true;
          order.exchange.requestDate = null;
          order.exchange.status = "Pending";
          order.exchange.reason = null;
          order.exchange.specificReason = specificReason.trim();
          order.exchange.newItemId = null;
          order.exchange.color = null;
          order.exchange.size = null;
          order.exchange.skuId = null;
        } else if (isExchange) {
          // Handle exchange case (update exchange field)
          console.log("Exchange Input:", { newItemId, color, size, skuId });
          // Validate new item details
          if (!newItemId || !mongoose.Types.ObjectId.isValid(newItemId)) {
            errors.push({ orderId, message: "Valid newItemId is required for exchange" });
            continue;
          }

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

          // Validate new item details against ItemDetail
          const newItemDetail = await ItemDetail.findOne({ itemId: newItemId });
          if (!newItemDetail) {
            errors.push({ orderId, message: `ItemDetail not found for newItemId: ${newItemId}` });
            continue;
          }
          console.log("ItemDetail ImagesByColor:", JSON.stringify(newItemDetail.imagesByColor, null, 2));

          const colorEntry = newItemDetail.imagesByColor.find(entry => entry.color.trim().toLowerCase() === color.trim().toLowerCase());
          if (!colorEntry) {
            errors.push({ orderId, message: `Color ${color} not available for newItemId: ${newItemId}` });
            continue;
          }
          console.log("ColorEntry Sizes:", JSON.stringify(colorEntry.sizes, null, 2));

          const sizeEntry = colorEntry.sizes.find(s => s.size.trim() === size.trim() && s.skuId.trim() === skuId.trim());
          if (!sizeEntry) {
            errors.push({ orderId, message: `Size ${size} or skuId ${skuId} not available for color ${color} in newItemId: ${newItemId}` });
            continue;
          }

          // Check stock availability for new item
          if (sizeEntry.stock <= 0) {
            errors.push({ orderId, message: `New item with size ${size} and skuId ${skuId} is out of stock for newItemId: ${newItemId}` });
            continue;
          }

          // Update exchange details
          order.exchange.isExchange = true;
          order.exchange.isReturn = false;
          order.exchange.requestDate = new Date();
          order.exchange.status = "Pending";
          order.exchange.reason = reason;
          order.exchange.specificReason = specificReason.trim();
          order.exchange.newItemId = newItemId;
          order.exchange.color = color;
          order.exchange.size = size;
          order.exchange.skuId = skuId;
          // Reset refund fields
          order.refund.isRefundActive = false;
          order.refund.requestDate = null;
          order.refund.status = "Pending";
          order.refund.amount = null;
          order.refund.reason = null;
        }

        // Save the updated order
        await order.save();

        // Populate referenced fields for response
        const populatedOrder = await UserOrder.findById(order._id)
          // .populate("userId", "name email")
          // .populate("itemDescription.itemId", "name MRP")
          // .populate("shippingAddressId", "address city state country postalCode")
          // .populate("invoiceId", "couponDiscount GST shippingCharge")
          // .populate("exchange.newItemId", "name MRP");

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
    return res.status(500).json(apiResponse(500, "Server error while initiating exchange/return", null));
  }
};