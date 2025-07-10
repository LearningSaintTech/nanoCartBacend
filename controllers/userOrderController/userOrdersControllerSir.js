const mongoose = require("mongoose");
const UserOrder = require("../../models/User/UserOrder");
const UserCart = require("../../models/User/UserCart");
const Invoice = require("../../models/Invoice/Invoice");
const UserAddress = require("../../models/User/UserAddress");
const Item = require("../../models/Items/Item");
const ItemDetail = require("../../models/Items/ItemDetail");
const User = require("../../models/User/User");
const { apiResponse } = require("../../utils/apiResponse");
const { randomUUID } = require("crypto");
const phonepeClient = require("../../utils/phonepeClient");
const { StandardCheckoutPayRequest, RefundRequest } = require("pg-sdk-node");
const sanitizeHtml = require("sanitize-html");

// Validate environment variables
if (!process.env.PHONEPE_REDIRECT_URL) {
  throw new Error("PHONEPE_REDIRECT_URL environment variable is required");
}

// Retry helper for PhonePe API calls
const withRetry = async (operation, maxRetries = 3, baseDelay = 1000, requestId) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("PhonePe API timeout")), 10000)
        ),
      ]);
    } catch (error) {
      console.log(`Attempt ${attempt} failed: ${error.message}`, requestId);
      if (attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// Helper to validate and update stock
const validateAndUpdateStock = async (orderDetails, session, requestId) => {
  for (const orderItem of orderDetails) {
    if (!mongoose.Types.ObjectId.isValid(orderItem.itemId)) {
      throw new Error("Valid itemId is required");
    }
    if (typeof orderItem.quantity !== "number" || orderItem.quantity < 1) {
      throw new Error("Valid quantity (minimum 1) is required");
    }
    if (!orderItem.size || typeof orderItem.size !== "string" || orderItem.size.trim() === "") {
      throw new Error("Valid size is required");
    }
    if (!orderItem.color || typeof orderItem.color !== "string" || orderItem.color.trim() === "") {
      throw new Error("Valid color is required");
    }
    if (!orderItem.skuId || typeof orderItem.skuId !== "string" || orderItem.skuId.trim() === "") {
      throw new Error("Valid skuId is required");
    }

    const itemDetail = await ItemDetail.findOne({ itemId: orderItem.itemId }).session(session);
    if (!itemDetail) {
      throw new Error(`Item detail for itemId ${orderItem.itemId} not found`);
    }

    const colorEntry = itemDetail.imagesByColor.find(
      (entry) => entry.color.toLowerCase() === orderItem.color.toLowerCase()
    );
    if (!colorEntry) {
      throw new Error(`Color ${orderItem.color} not found for itemId ${orderItem.itemId}`);
    }

    const sizeEntry = colorEntry.sizes.find(
      (s) => s.size === orderItem.size && s.skuId === orderItem.skuId
    );
    if (!sizeEntry) {
      throw new Error(`Size ${orderItem.size} with skuId ${orderItem.skuId} not found`);
    }

    if (!sizeEntry.stock || sizeEntry.stock < orderItem.quantity) {
      throw new Error(
        `Insufficient stock for itemId ${orderItem.itemId}, size ${orderItem.size}, skuId ${orderItem.skuId}. Available: ${sizeEntry.stock || 0}, Requested: ${orderItem.quantity}`
      );
    }

    await ItemDetail.updateOne(
      {
        itemId: orderItem.itemId,
        "imagesByColor.color": orderItem.color,
        "imagesByColor.sizes.size": orderItem.size,
        "imagesByColor.sizes.skuId": orderItem.skuId,
      },
      { $inc: { "imagesByColor.$[color].sizes.$[size].stock": -orderItem.quantity } },
      {
        arrayFilters: [
          { "color.color": orderItem.color },
          { "size.size": orderItem.size, "size.skuId": orderItem.skuId },
        ],
        session,
      }
    );
    console.log(`Stock updated for itemId ${orderItem.itemId}, skuId ${orderItem.skuId}`, requestId);
  }
};

// Helper to populate order details
const populateOrderDetails = async (orders, userId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid userId");
    }

    const ordersArray = Array.isArray(orders) ? orders : [orders];
    const populatedOrders = await UserOrder.populate(ordersArray, {
      path: "userId",
      model: "User",
      select: "name email phoneNumber role",
    });

    const enrichedOrders = await Promise.all(
      populatedOrders.map(async (order) => {
        const populatedOrder = await UserOrder.populate(order, {
          path: "orderDetails.itemId",
          model: "Item",
          select: "name description MRP discountedPrice",
        });

        let shippingAddress = null;
        if (order.shippingAddressId && mongoose.Types.ObjectId.isValid(order.shippingAddressId)) {
          try {
            const userAddress = await UserAddress.findOne({
              userId: order.userId._id,
              "addressDetail._id": order.shippingAddressId,
            });
            if (userAddress) {
              const matchedAddress = userAddress.addressDetail.find(
                (addr) => addr._id.toString() === order.shippingAddressId.toString()
              );
              if (matchedAddress) {
                shippingAddress = { ...matchedAddress.toObject() };
              }
            }
          } catch (error) {
            console.log(`Error fetching shippingAddressId ${order.shippingAddressId}: ${error.message}`, randomUUID());
          }
        }

        const enrichedOrderDetails = await Promise.all(
          populatedOrder.orderDetails.map(async (detail) => {
            let image = null;
            try {
              const itemDetail = await ItemDetail.findOne({ itemId: detail.itemId._id });
              if (itemDetail) {
                const colorEntry = itemDetail.imagesByColor.find(
                  (entry) => entry.color.toLowerCase() === detail.color.toLowerCase()
                );
                if (colorEntry && colorEntry.images && colorEntry.images.length > 0) {
                  const sortedImages = colorEntry.images.sort((a, b) => (a.priority || 0) - (b.priority || 0));
                  image = sortedImages[0]?.url || null;
                }
              }
            } catch (error) {
              console.log(`Error fetching image for itemId ${detail.itemId._id}: ${error.message}`, randomUUID());
            }

            let pickupLocation = null;
            if (detail.returnInfo?.pickupLocationId && mongoose.Types.ObjectId.isValid(detail.returnInfo.pickupLocationId)) {
              try {
                const userAddress = await UserAddress.findOne({
                  userId: order.userId._id,
                  "addressDetail._id": detail.returnInfo.pickupLocationId,
                });
                if (userAddress) {
                  const matchedAddress = userAddress.addressDetail.find(
                    (addr) => addr._id.toString() === detail.returnInfo.pickupLocationId.toString()
                  );
                  if (matchedAddress) {
                    pickupLocation = { ...matchedAddress.toObject() };
                    detail.returnInfo.pickupLocationId = pickupLocation;
                  }
                }
              } catch (error) {
                console.log(`Error fetching return pickupLocationId: ${error.message}`, randomUUID());
              }
            }

            if (detail.exchangeInfo?.pickupLocationId && mongoose.Types.ObjectId.isValid(detail.exchangeInfo.pickupLocationId)) {
              try {
                const userAddress = await UserAddress.findOne({
                  userId: order.userId._id,
                  "addressDetail._id": detail.exchangeInfo.pickupLocationId,
                });
                if (userAddress) {
                  const matchedAddress = userAddress.addressDetail.find(
                    (addr) => addr._id.toString() === detail.exchangeInfo.pickupLocationId.toString()
                  );
                  if (matchedAddress) {
                    pickupLocation = { ...matchedAddress.toObject() };
                    detail.exchangeInfo.pickupLocationId = pickupLocation;
                  }
                }
              } catch (error) {
                console.log(`Error fetching exchange pickupLocationId: ${error.message}`, randomUUID());
              }
            }

            return {
              ...detail.toObject(),
              itemId: {
                _id: detail.itemId._id,
                name: detail.itemId.name,
                description: detail.itemId.description,
                MRP: detail.itemId.MRP,
                discountedPrice: detail.itemId.discountedPrice,
                image,
              },
              returnInfo: detail.returnInfo ? { ...detail.returnInfo.toObject(), pickupLocationId: detail.returnInfo.pickupLocationId } : null,
              exchangeInfo: detail.exchangeInfo ? { ...detail.exchangeInfo.toObject(), pickupLocationId: detail.exchangeInfo.pickupLocationId } : null,
            };
          })
        );

        return {
          ...populatedOrder.toObject(),
          shippingAddressId: shippingAddress,
          orderDetails: enrichedOrderDetails,
        };
      })
    );

    return Array.isArray(orders) ? enrichedOrders : enrichedOrders[0];
  } catch (error) {
    console.log(`Error populating order details: ${error.message}`, randomUUID());
    throw error;
  }
};


exports.createUserOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const requestId = randomUUID();

  try {
    console.log("Starting order creation", requestId);
    const { userId } = req.user;
    const { orderDetails, invoice, shippingAddressId, paymentMethod, totalAmount } = req.body;

    console.log("Received request body:", JSON.stringify(req.body, null, 2), requestId);

    // Validate userId
    if (!mongoose.isValidObjectId(userId)) {
      console.log("Invalid userId", userId, requestId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Invalid userId"));
    }

    // Validate orderDetails
    if (!orderDetails || !Array.isArray(orderDetails) || orderDetails.length === 0) {
      console.log("Invalid orderDetails", orderDetails, requestId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "orderDetails array is required and cannot be empty"));
    }

    // Validate invoice
    if (!Array.isArray(invoice) || invoice.length === 0) {
      console.log("Invalid invoice", invoice, requestId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Non-empty invoice array is required"));
    }

    for (const entry of invoice) {
      if (!entry.key || typeof entry.key !== "string" || entry.key.trim() === "") {
        console.log(`Invalid invoice key: ${entry.key || "undefined"}`, requestId);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Invalid invoice key: ${entry.key || "undefined"}`));
      }
      if (typeof entry.value !== "number" || isNaN(entry.value)) {
        console.log(`Invalid invoice value for key "${entry.key}": ${entry.value}`, requestId);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Invalid invoice value for key "${entry.key}": ${entry.value}`));
      }
    }

    // Validate totalAmount
    if (typeof totalAmount !== "number" || totalAmount <= 0) {
      console.log("Invalid totalAmount", totalAmount, requestId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid totalAmount is required and must be positive"));
    }

    // Validate paymentMethod
    if (!paymentMethod || !["Online", "COD"].includes(paymentMethod)) {
      console.log("Invalid payment method", paymentMethod, requestId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid payment method (Online or COD) is required"));
    }

    // Validate shippingAddressId
    if (!shippingAddressId) {
      console.log("Missing shippingAddressId", requestId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "shippingAddressId is required"));
    }

    if (!mongoose.isValidObjectId(shippingAddressId)) {
      console.log("Invalid shippingAddressId", shippingAddressId, requestId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Invalid shippingAddressId"));
    }

    // Check if shipping address exists
    const addressExists = await UserAddress.findOne({
      userId,
      "addressDetail._id": shippingAddressId,
    }).session(session);
    console.log("Shipping address found:", !!addressExists, requestId);
    if (!addressExists) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "Shipping address not found"));
    }

    // Fetch user cart
    const userCart = await UserCart.findOne({ userId }).session(session);
    console.log("User cart found:", !!userCart, requestId);
    if (!userCart) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "User cart not found"));
    }

    // Validate orderDetails against cart items
    for (const orderItem of orderDetails) {
      const cartItem = userCart.items.find(
        (item) =>
          item.itemId.toString() === orderItem.itemId.toString() &&
          item.size === orderItem.size &&
          item.color.toLowerCase() === orderItem.color.toLowerCase() &&
          item.skuId === orderItem.skuId &&
          item.quantity >= orderItem.quantity
      );

      if (!cartItem) {
        console.log(`Order item not found in cart or insufficient quantity: ${JSON.stringify(orderItem)}`, requestId);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Order item not found in cart or insufficient quantity: itemId ${orderItem.itemId}`));
      }
    }

    // Generate order IDs
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const merchantOrderId = randomUUID();
    console.log("Generated Order IDs", orderId, merchantOrderId, requestId);

    // Prepare order data
    const orderData = {
      orderId,
      userId,
      orderDetails: orderDetails.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        size: item.size,
        color: item.color.toLowerCase(),
        skuId: item.skuId,
        addedAt: new Date(),
        isReturn: false,
        isExchange: false,
      })),
      invoice,
      shippingAddressId,
      paymentMethod,
      isOrderPlaced: paymentMethod === "COD" ? true : false,
      totalAmount,
      orderStatus: paymentMethod === "COD" ? "Confirmed" : "Initiated",
      orderStatusDate: new Date(),
      paymentStatus: "Pending",
      phonepeOrderId: null,
      phonepeMerchantOrderId: null,
      checkoutPageUrl: null,
      isOrderCancelled: false,
      deliveryDate: null,
    };

    // Handle online payment if applicable
    if (paymentMethod === "Online") {
      const request = StandardCheckoutPayRequest.builder()
        .merchantOrderId(merchantOrderId)
        .amount(totalAmount * 100)
        .redirectUrl(process.env.PHONEPE_REDIRECT_URL)
        .build();

      console.log("Initiating PhonePe payment request...", requestId);
      const response = await withRetry(() => phonepeClient.initiatePayment(request), 3, 1000, requestId);
      orderData.phonepeOrderId = response.orderId;
      orderData.phonepeMerchantOrderId = merchantOrderId;
      orderData.checkoutPageUrl = response.redirectUrl;
      console.log("PhonePe payment initiated", JSON.stringify(response, null, 2), requestId);
    }

    // Save order
    const newOrder = new UserOrder(orderData);
    const savedOrder = await newOrder.save({ session });
    console.log("Order saved to DB", requestId);

    // Update stock after order creation
    await validateAndUpdateStock(orderDetails, session, requestId);
    console.log("Stock updated after order creation", requestId);

    // Update cart: Remove ordered items
    userCart.items = userCart.items.filter(
      (cartItem) =>
        !orderDetails.some(
          (orderItem) =>
            orderItem.itemId.toString() === cartItem.itemId.toString() &&
            orderItem.size === cartItem.size &&
            cartItem.color.toLowerCase() === orderItem.color.toLowerCase() &&
            orderItem.skuId === cartItem.skuId
        )
    );
    await userCart.save({ session });
    console.log("User cart updated after placing order", requestId);

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Populate order details
    const populatedOrder = await populateOrderDetails(savedOrder, userId);
    console.log(`Order created successfully: ${orderId}`, requestId);
    return res.status(201).json(apiResponse(201, true, "Order created successfully", populatedOrder));
  } catch (error) {
    console.error("Exception occurred:", error.message, requestId);
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json(apiResponse(400, false, error.message || "Error while creating order"));
  }
};


// Verify payment status for Online orders
exports.verifyPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const requestId = randomUUID();

  try {
    console.log("Verifying payment", requestId);
    const { userId } = req.user;
    const { phonepeMerchantOrderId } = req.body;

    if (!phonepeMerchantOrderId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Missing phonepeMerchantOrderId"));
    }

    const userOrder = await UserOrder.findOne({
      phonepeMerchantOrderId,
      userId,
    }).session(session);
    if (!userOrder) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "Order not found or not authorized"));
    }

    const orderAge = (Date.now() - userOrder.createdAt.getTime()) / (1000 * 60);
    if (orderAge > 30 && userOrder.paymentStatus === "Pending") {
      userOrder.paymentStatus = "Expired";
      userOrder.orderStatus = "Cancelled";
      userOrder.isOrderCancelled = true;
      await userOrder.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Order has expired"));
    }

    if (["Paid", "Failed", "Expired"].includes(userOrder.paymentStatus)) {
      await session.commitTransaction();
      session.endSession();
      const populatedOrder = await populateOrderDetails(userOrder, userId);
      return res.status(200).json(
        apiResponse(200, true, `Payment already processed as ${userOrder.paymentStatus}`, populatedOrder)
      );
    }

    const response = await withRetry(
      () => phonepeClient.checkStatus(phonepeMerchantOrderId),
      3,
      1000,
      requestId
    );

    let populatedOrder;
    switch (response.state) {
      case "COMPLETED":
        try {
          // Stock already updated in createUserOrder, no need to update again
          userOrder.paymentStatus = "Paid";
          userOrder.isOrderPlaced = true;
          userOrder.orderStatus = "Confirmed";
          await userOrder.save({ session });
        } catch (stockError) {
          if (stockError.message.includes("Insufficient stock")) {
            const merchantRefundId = randomUUID();
            const refundRequest = RefundRequest.builder()
              .merchantRefundId(merchantRefundId)
              .originalMerchantOrderId(phonepeMerchantOrderId)
              .amount(userOrder.totalAmount * 100)
              .build();

            await withRetry(() => phonepeClient.initiateRefund(refundRequest), 3, 1000, requestId);

            userOrder.paymentStatus = "Failed";
            userOrder.orderStatus = "Cancelled";
            userOrder.isOrderCancelled = true;
            userOrder.refund = {
              refundReason: "Insufficient stock",
              requestDate: new Date(),
              refundAmount: userOrder.totalAmount,
              merchantRefundId,
              refundStatus: "Processing",
            };
            await userOrder.save({ session });
            await session.commitTransaction();
            session.endSession();
            return res.status(400).json(apiResponse(400, false, stockError.message));
          }
          throw stockError;
        }
        break;

      case "FAILED":
      case "ATTEMPT_FAILED":
        userOrder.paymentStatus = "Failed";
        userOrder.orderStatus = "Cancelled";
        userOrder.isOrderCancelled = true;
        await userOrder.save({ session });
        break;

      case "PENDING":
      case "INITIATED":
        await session.commitTransaction();
        session.endSession();
        return res.status(200).json(apiResponse(200, false, "Payment is still pending"));

      default:
        await session.commitTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Unexpected payment state: ${response.state}`));
    }

    await session.commitTransaction();
    session.endSession();
    populatedOrder = await populateOrderDetails(userOrder, userId);
    console.log(`Payment verified: ${phonepeMerchantOrderId}, state: ${response.state}`, requestId);
    return res.status(200).json(apiResponse(200, true, "Payment processed successfully", populatedOrder));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.log(`Error verifying payment: ${error.message}`, requestId);
    return res.status(500).json(apiResponse(500, false, error.message || "Error verifying payment"));
  }
};
 
// Handle PhonePe server-to-server callbacks
exports.handlePhonePeCallback = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const requestId = randomUUID();

  try {
    console.log("Processing PhonePe callback", requestId);
    const authorizationHeader = req.headers["authorization"];
    const responseBody = JSON.stringify(req.body);

    if (!authorizationHeader || !responseBody) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Missing callback parameters"));
    }

    // TODO: Implement PhonePe signature validation as per SDK documentation
    const callbackResponse = req.body;
    const { orderId, state } = callbackResponse;

    const order = await UserOrder.findOne({ phonepeOrderId: orderId }).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "Order not found"));
    }

    if (["Paid", "Failed", "Expired"].includes(order.paymentStatus)) {
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json(apiResponse(200, true, `Callback already processed as ${order.paymentStatus}`));
    }

    if (state === "COMPLETED") {
      // Stock already updated in createUserOrder, no need to update again
      order.paymentStatus = "Paid";
      order.isOrderPlaced = true;
      order.orderStatus = "Confirmed";
    } else if (state === "FAILED" || state === "ATTEMPT_FAILED") {
      order.paymentStatus = "Failed";
      order.orderStatus = "Cancelled";
      order.isOrderCancelled = true;
    } else {
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json(apiResponse(200, true, "Callback received but no action taken"));
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    console.log(`Callback processed successfully for order: ${orderId}, state: ${state}`, requestId);
    return res.status(200).json(apiResponse(200, true, "Callback processed successfully"));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.log(`Error processing callback: ${error.message}`, requestId);
    return res.status(400).json(apiResponse(400, false, "Error processing callback"));
  }
};




exports.cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const requestId = randomUUID();

  try {
    console.log("Cancelling order", requestId);
    const { userId } = req.user;
    const { orderId, refundReason } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log("Invalid userId:", userId, requestId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Invalid userId"));
    }

    // Validate orderId
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      console.log("Invalid orderId:", orderId, requestId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid orderId is required"));
    }

    // Sanitize refund reason
    const sanitizedRefundReason = refundReason ? sanitizeHtml(refundReason) : null;

    // Find order
    console.log("Finding order:", orderId, requestId);
    const order = await UserOrder.findOne({ orderId, userId }).session(session);
    if (!order) {
      console.log("Order not found:", orderId, requestId);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "Order not found"));
    }

    // Check if order is already cancelled
    if (order.isOrderCancelled) {
      console.log("Order already cancelled:", orderId, requestId);
      await session.commitTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Order is already cancelled"));
    }

    // Check for non-cancellable statuses
    const nonCancellableStatuses = ["Dispatched", "Delivered", "Returned"];
    if (nonCancellableStatuses.includes(order.orderStatus)) {
      console.log(`Order cannot be cancelled in ${order.orderStatus} status`, requestId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, `Order cannot be cancelled in ${order.orderStatus} status`));
    }

    // Calculate refund amount
    let totalRefundAmount = order.totalAmount; // Use totalAmount for simplicity
    console.log(`Calculated totalRefundAmount: ${totalRefundAmount}`, requestId);

    // Update order status
    order.orderStatus = "Cancelled";
    order.isOrderCancelled = true;

    // Handle refund for online payments
    if (order.paymentMethod === "Online" && order.paymentStatus === "Paid") {
      if (!order.phonepeMerchantOrderId) {
        console.log("No valid PhonePe merchant order ID found", requestId);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, "No valid PhonePe merchant order ID found"));
      }

      if (order.refund && order.refund.refundTransactionId) {
        console.log("Refund already initiated for order:", orderId, requestId);
        await session.commitTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, "Refund already initiated"));
      }

      const merchantRefundId = randomUUID();
      const request = RefundRequest.builder()
        .merchantRefundId(merchantRefundId)
        .originalMerchantOrderId(order.phonepeMerchantOrderId)
        .amount(totalRefundAmount * 100)
        .build();

      console.log("Initiating refund for order:", orderId, requestId);
      const refund = await withRetry(() => phonepeClient.initiateRefund(request), 3, 1000, requestId);

      order.refund = {
        refundReason: sanitizedRefundReason || "User cancellation",
        requestDate: new Date(),
        refundAmount: totalRefundAmount,
        refundTransactionId: refund.refundId,
        merchantRefundId,
        refundStatus: "Processing",
      };
      console.log("Refund details set for order:", orderId, requestId);
    } else if (order.paymentMethod === "COD") {
      order.refund = {
        refundReason: sanitizedRefundReason || "User cancellation",
        requestDate: new Date(),
      };
      console.log("COD refund details set for order:", orderId, requestId);
    }

    // Save order changes
    await order.save({ session });
    console.log("Order status updated to Cancelled:", orderId, requestId);

    // Update stock for each item in orderDetails
    console.log("Starting stock update for order:", orderId, requestId);
    for (const orderDetail of order.orderDetails) {
      // Validate order item fields
      if (!mongoose.Types.ObjectId.isValid(orderDetail.itemId)) {
        console.log(`Invalid itemId: ${orderDetail.itemId}`, requestId);
        throw new Error(`Invalid itemId: ${orderDetail.itemId}`);
      }
      if (typeof orderDetail.quantity !== "number" || orderDetail.quantity < 1) {
        console.log(`Invalid quantity for itemId ${orderDetail.itemId}: ${orderDetail.quantity}`, requestId);
        throw new Error(`Invalid quantity for itemId ${orderDetail.itemId}: ${orderDetail.quantity}`);
      }
      if (!orderDetail.size || typeof orderDetail.size !== "string" || orderDetail.size.trim() === "") {
        console.log(`Invalid size for itemId ${orderDetail.itemId}`, requestId);
        throw new Error(`Valid size is required for itemId ${orderDetail.itemId}`);
      }
      if (!orderDetail.color || typeof orderDetail.color !== "string" || orderDetail.color.trim() === "") {
        console.log(`Invalid color for itemId ${orderDetail.itemId}`, requestId);
        throw new Error(`Valid color is required for itemId ${orderDetail.itemId}`);
      }
      if (!orderDetail.skuId || typeof orderDetail.skuId !== "string" || orderDetail.skuId.trim() === "") {
        console.log(`Invalid skuId for itemId ${orderDetail.itemId}`, requestId);
        throw new Error(`Valid skuId is required for itemId ${orderDetail.itemId}`);
      }

      // Find item details
      const itemDetail = await ItemDetail.findOne({ itemId: orderDetail.itemId }).session(session);
      if (!itemDetail) {
        console.log(`Item detail not found for itemId ${orderDetail.itemId}`, requestId);
        throw new Error(`Item detail for itemId ${orderDetail.itemId} not found`);
      }

      // Validate color
      const colorEntry = itemDetail.imagesByColor.find(
        (entry) => entry.color.toLowerCase() === orderDetail.color.toLowerCase()
      );
      if (!colorEntry) {
        console.log(`Color ${orderDetail.color} not found for itemId ${orderDetail.itemId}`, requestId);
        throw new Error(`Color ${orderDetail.color} not found for itemId ${orderDetail.itemId}`);
      }

      // Validate size and sku
      const sizeEntry = colorEntry.sizes.find(
        (s) => s.size.toLowerCase() === orderDetail.size.toLowerCase() && s.skuId === orderDetail.skuId
      );
      if (!sizeEntry) {
        console.log(`Size ${orderDetail.size} with skuId ${orderDetail.skuId} not found for itemId ${orderDetail.itemId}`, requestId);
        throw new Error(`Size ${orderDetail.size} with skuId ${orderDetail.skuId} not found for itemId ${orderDetail.itemId}`);
      }

      // Increment stock for cancellation
      const currentStock = sizeEntry.stock || 0;
      sizeEntry.stock = currentStock + orderDetail.quantity;
      sizeEntry.isOutOfStock = sizeEntry.stock === 0;

      // Save the itemDetail to trigger the post-save hook
      await itemDetail.save({ session });

      console.log(
        `Stock restored for itemId ${orderDetail.itemId}, skuId ${orderDetail.skuId}, quantity: ${orderDetail.quantity}, new stock: ${sizeEntry.stock}, isOutOfStock: ${sizeEntry.isOutOfStock}`,
        requestId
      );
    }

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Populate order details
    const enrichedOrder = await populateOrderDetails(order, userId);
    console.log(`Order cancelled successfully: ${orderId}`, requestId);
    return res.status(200).json(apiResponse(200, true, "Order cancelled successfully", enrichedOrder));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.log(`Error cancelling order: ${error.message}`, requestId);
    return res.status(500).json(apiResponse(500, false, error.message || "Error while cancelling order"));
  }
};







exports.returnRefund = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const requestId = randomUUID();

  try {
    console.log('Processing return and refund', requestId);
    const { userId } = req.user;
    const { orderId, itemIds, returnReason, specificReturnReason, pickupLocationId, bankDetails } = req.body;

    console.log('Request body received:', req.body);
    console.log('User ID:', userId);

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log('Invalid userId:', userId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Invalid userId'));
    }

    // Validate orderId
    if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
      console.log('Invalid orderId:', orderId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Valid orderId is required'));
    }

    // Validate itemIds array
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      console.log('Invalid itemIds:', itemIds);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'At least one valid itemId is required'));
    }

    // Validate each itemId
    for (const itemId of itemIds) {
      if (!mongoose.Types.ObjectId.isValid(itemId)) {
        console.log(`Invalid itemId: ${itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Invalid itemId: ${itemId}`));
      }
    }

    // Validate returnReason
    const validReturnReasons = [
      'Size too small',
      'Size too big',
      "Don't like the fit",
      "Don't like the quality",
      'Not same as the catalogue',
      'Product is damaged',
      'Wrong product is received',
      'Product arrived too late',
    ];
    if (!returnReason || !validReturnReasons.includes(returnReason)) {
      console.log('Invalid returnReason:', returnReason);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Valid returnReason is required'));
    }

    // Validate specificReturnReason
    const sanitizedSpecificReason = sanitizeHtml(specificReturnReason || '');
    if (!sanitizedSpecificReason) {
      console.log('Invalid specificReturnReason:', specificReturnReason);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Valid specificReturnReason is required'));
    }

    // Validate pickupLocationId
    if (!pickupLocationId || !mongoose.Types.ObjectId.isValid(pickupLocationId)) {
      console.log('Invalid pickupLocationId:', pickupLocationId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Valid pickupLocationId is required'));
    }

    // Validate bankDetails for COD payment method
    let sanitizedBankDetails = null;
    if (bankDetails) {
      const { accountNumber, ifscCode, bankName, accountHolderName } = bankDetails;
      if (
        !accountNumber ||
        !ifscCode ||
        !bankName ||
        !accountHolderName ||
        typeof accountNumber !== 'string' ||
        typeof ifscCode !== 'string' ||
        typeof bankName !== 'string' ||
        typeof accountHolderName !== 'string' ||
        accountNumber.trim() === '' ||
        ifscCode.trim() === '' ||
        bankName.trim() === '' ||
        accountHolderName.trim() === ''
      ) {
        console.log('Incomplete bankDetails:', bankDetails);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, 'Complete and valid bankDetails are required'));
      }
      sanitizedBankDetails = {
        accountNumber: sanitizeHtml(accountNumber),
        ifscCode: sanitizeHtml(ifscCode),
        bankName: sanitizeHtml(bankName),
        accountHolderName: sanitizeHtml(accountHolderName),
      };
    }

    // Find order
    console.log('🔎 Finding order:', orderId);
    const order = await UserOrder.findOne({ orderId, userId }).session(session);
    if (!order) {
      console.log('Order not found:', orderId);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, 'Order not found'));
    }

    if (order.orderStatus === "Cancelled") {
      return res.status(400).json(apiResponse(400, false, 'Order status is Cancelled Cannot returned'));
    }
    if (order.orderStatus === "Returned") {
      return res.status(400).json(apiResponse(400, false, 'Order is already returned'));
    }
    if (order.orderStatus === "Exchanged") {
      return res.status(400).json(apiResponse(400, false, 'Order status is Exchanged Cannot returned'));
    }

    // Check if order is delivered
    if (order.orderStatus !== 'Delivered' && order.orderStatus !== "Partially Returned") {
      console.log('Order not delivered, status:', order.orderStatus);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Order must be in Delivered status to initiate a return'));
    }
    if (order.paymentStatus !== 'Paid') {
      console.log('Order not paid, status:', order.paymentStatus);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Order must be in paid paymentStatus to initiate a return'));
    }

    // Require bankDetails for COD payments
    if (order.paymentMethod === 'COD' && !sanitizedBankDetails) {
      console.log('bankDetails required for COD payment method');
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'bankDetails are required for COD payment refunds'));
    }

    // Match by itemId
    const orderDetails = [];
    for (const itemId of itemIds) {
      const orderDetail = order.orderDetails.find((detail) => detail.itemId.toString() === itemId.toString());
      if (!orderDetail) {
        console.log(`Item not found in order details: ${itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json(apiResponse(404, false, `Item not found in order details: ${itemId}`));
      }
      orderDetails.push(orderDetail);
    }

    // Check for existing return or exchange
    for (const orderDetail of orderDetails) {
      if (orderDetail.isReturn || (orderDetail.returnInfo?.refundStatus && orderDetail.returnInfo.refundStatus !== 'Completed')) {
        console.log(`⚠️ Return already in progress for item: ${orderDetail.itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `A return request is already in progress for item: ${orderDetail.itemId}`));
      }
      if (orderDetail.isExchange || (orderDetail.exchangeInfo?.exchangeStatus && orderDetail.exchangeInfo.exchangeStatus !== 'Completed')) {
        console.log(`⚠️ Exchange already in progress for item: ${orderDetail.itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `An exchange request is already in progress for item: ${orderDetail.itemId}`));
      }
    }

    // Validate pickup location
    console.log('🔎 Checking pickup location:', pickupLocationId, 'for user:', userId);
    const addressExists = await UserAddress.findOne({
      userId,
      "addressDetail._id": pickupLocationId,
    }).session(session);
    if (!addressExists) {
      console.log('Pickup address not found for user:', pickupLocationId);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, `Pickup address not found: ${pickupLocationId}`));
    }

    // Find the specific address detail
    let pickupAddress = null;
    const matchedAddress = addressExists.addressDetail.find(
      (addr) => addr._id.toString() === pickupLocationId.toString()
    );
    if (matchedAddress) {
      pickupAddress = { ...matchedAddress.toObject() };
    } else {
      console.log('Pickup address detail not found:', pickupLocationId);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, `Pickup address detail not found: ${pickupLocationId}`));
    }

    // Calculate refund amount for each item
    let totalRefundAmount = 0;
    const isSingleItemOrder = order.orderDetails.length === 1;
    const refundAmounts = [];

    for (const orderDetail of orderDetails) {
      // Fetch item details
      const item = await Item.findById(orderDetail.itemId).session(session);
      if (!item) {
        console.log(`Item not found: ${orderDetail.itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json(apiResponse(404, false, `Item with ID ${orderDetail.itemId} not found`));
      }

      let refundAmount;
      if (isSingleItemOrder) {
        // Single-item order: Use totalAmount
        if (order.paymentMethod === 'COD') {
          refundAmount = Math.max(0, order.totalAmount - 50); // Deduct ₹50 for COD
          console.log("Refund Amount in single item case", refundAmount);
        } else if (order.paymentMethod === 'Online') {
          refundAmount = order.totalAmount; // Full totalAmount
          console.log("Refund Amount of online payment in single item case", refundAmount);
        }
      } else {
        // Multi-item order: Use discountedPrice * quantity
        const itemPrice = item.discountedPrice || item.MRP;
        console.log("111 itemPrice", itemPrice);
        if (typeof itemPrice !== 'number' || itemPrice <= 0) {
          console.log(`Invalid price for itemId: ${orderDetail.itemId}`);
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json(apiResponse(400, false, `Invalid price for itemId ${orderDetail.itemId}`));
        }
        const quantity = orderDetail.quantity;

        if (typeof quantity !== 'number' || quantity < 1) {
          console.log(`Invalid quantity for itemId: ${orderDetail.itemId}`);
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json(apiResponse(400, false, `Invalid quantity for itemId ${orderDetail.itemId}`));
        }
        const itemTotal = itemPrice * quantity;
        if (order.paymentMethod === 'COD') {
          refundAmount = Math.max(0, itemTotal - 50); // Deduct ₹50 for COD
          console.log("Refund Amount 222222", refundAmount);
        } else if (order.paymentMethod === 'Online') {
          refundAmount = itemTotal; // Full item total
          console.log("Refund Amount 333333", refundAmount);
        }
      }

      // Validate refundAmount
      if (typeof refundAmount !== 'number' || refundAmount <= 0) {
        console.log(`Invalid refund amount for itemId: ${orderDetail.itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Calculated refund amount is invalid for itemId ${orderDetail.itemId}`));
      }

      refundAmounts.push({ itemId: orderDetail.itemId, refundAmount });
      totalRefundAmount += refundAmount;
    }

    // Handle refund processing for Online payments
    let refundStatus = 'Initiated';
    let merchantRefundId;

    if (order.paymentMethod === 'Online' && order.paymentStatus === 'Paid') {
      // Validate merchant order ID
      if (!order.phonepeMerchantOrderId) {
        console.log('No valid PhonePe merchant order ID found');
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, 'No valid PhonePe merchant order ID found'));
      }

      // Check if refund is already initiated for any item
      for (const orderDetail of orderDetails) {
        if (orderDetail.returnInfo?.returnAndRefundTransactionId) {
          console.log(`Refund already initiated for item: ${orderDetail.itemId}`);
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json(apiResponse(400, false, `Refund already initiated for item: ${orderDetail.itemId}`));
        }
      }

      // Initiate refund
      merchantRefundId = randomUUID();
      const request = RefundRequest.builder()
        .merchantRefundId(merchantRefundId)
        .originalMerchantOrderId(order.phonepeMerchantOrderId)
        .amount(Math.round(totalRefundAmount * 100)) // Convert to paise
        .build();

      await withRetry(
        () => phonepeClient.initiateRefund(request),
        3,
        1000,
        requestId
      );
    }

    // Update returnInfo for each item
    for (const orderDetail of orderDetails) {
      console.log(`📦 Updating return status for item: ${orderDetail.itemId}`);
      orderDetail.isReturn = true;
      const refundAmount = refundAmounts.find(
        (item) => item.itemId.toString() === orderDetail.itemId.toString()
      ).refundAmount;

      orderDetail.returnInfo = {
        returnReason,
        specificReturnReason: sanitizedSpecificReason,
        requestDate: new Date(),
        pickupLocationId: pickupAddress, // Store the full address object
        returnAndRefundTransactionId: null, // Set to null as requested
        bankDetails: sanitizedBankDetails || undefined,
        refundStatus: 'Initiated', // Set to Initiated as requested
        refundAmount,
      };
    }

    // Update order status based on isReturn status of all items
    const allItemsReturned = order.orderDetails.every(detail => detail.isReturn);
    if (allItemsReturned) {
      order.orderStatus = 'Returned';
    } else {
      order.orderStatus = 'Partially Returned';
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    // Enrich order details
    const enrichedOrder = await populateOrderDetails(order, userId);
    console.log(`Return and refund initiated for orderId: ${orderId}`, requestId);

    return res.status(200).json(apiResponse(200, true, 'Return and refund request initiated', { order: enrichedOrder }));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.log(`Error processing return and refund: ${error.message}`, requestId);
    return res.status(500).json(apiResponse(500, false, error.message || 'Error processing return and refund'));
  }
};




exports.returnAndExchange = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const requestId = randomUUID();

  try {
    console.log('Processing return and exchange', requestId);
    const { userId } = req.user;
    const { orderId, itemIds, pickupLocationId } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log('Invalid userId:', userId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Invalid userId'));
    }

    // Validate orderId
    if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
      console.log('Invalid orderId:', orderId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Valid orderId is required'));
    }

    // Validate itemIds array
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      console.log('Invalid itemIds:', itemIds);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'At least one itemId object is required'));
    }

    // Validate each item in itemIds
    for (const item of itemIds) {
      const { itemId, desiredColor, desiredSize, exchangeReason, exchangeSpecificReason } = item;

      // Validate itemId
      if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
        console.log('Invalid itemId:', itemId);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Valid itemId is required for item: ${itemId}`));
      }

      // Validate desiredColor
      if (!desiredColor || typeof desiredColor !== 'string' || desiredColor.trim() === '') {
        console.log('Invalid desiredColor:', desiredColor);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Valid desiredColor is required for item: ${itemId}`));
      }

      // Validate desiredSize
      if (!desiredSize || typeof desiredSize !== 'string' || desiredSize.trim() === '') {
        console.log('Invalid desiredSize:', desiredSize);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Valid desiredSize is required for item: ${itemId}`));
      }

      // Validate exchangeReason
      const validExchangeReasons = [
        'Size too small',
        'Size too big',
        "Don't like the fit",
        "Don't like the quality",
        'Not same as the catalogue',
        'Product is damaged',
        'Wrong product is received',
        'Product arrived too late',
      ];
      if (!exchangeReason || !validExchangeReasons.includes(exchangeReason)) {
        console.log('Invalid exchangeReason:', exchangeReason);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Valid exchangeReason is required for item: ${itemId}`));
      }

      // Validate exchangeSpecificReason
      if (!exchangeSpecificReason || typeof exchangeSpecificReason !== 'string' || exchangeSpecificReason.trim() === '') {
        console.log('Invalid exchangeSpecificReason:', exchangeSpecificReason);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Valid exchangeSpecificReason is required for item: ${itemId}`));
      }
    }

    // Validate pickupLocationId
    if (!pickupLocationId || !mongoose.Types.ObjectId.isValid(pickupLocationId)) {
      console.log('Invalid pickupLocationId:', pickupLocationId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Valid pickupLocationId is required'));
    }

    // Find order
    console.log('🔎 Finding order:', orderId);
    const order = await UserOrder.findOne({ orderId, userId }).session(session);
    if (!order) {
      console.log('Order not found:', orderId);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, 'Order not found'));
    }

    // Check order status
    if (order.orderStatus === 'Exchanged') {
      console.log('Order is already Exchanged:', orderId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Order is already Exchanged'));
    }
    if (order.orderStatus === 'Returned') {
      console.log('Order is already returned:', orderId);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Order is already returned'));
    }

    if (order.orderStatus !== 'Delivered' && order.orderStatus !== 'Partially Exchanged') {
      console.log('Order not delivered, status:', order.orderStatus);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Order must be in Delivered or Partially Exchanged status to initiate an exchange'));
    }

    if (order.paymentStatus !== 'Paid') {
      console.log('Order not paid, status:', order.paymentStatus);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, 'Order must be in Paid paymentStatus to initiate an exchange'));
    }

    // Validate pickup address
    console.log('🔎 Validating pickup address:', pickupLocationId);
    const addressExists = await UserAddress.findOne({
      userId,
      'addressDetail._id': pickupLocationId,
    }).session(session);
    if (!addressExists) {
      console.log('Pickup address not found:', pickupLocationId);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, 'Pickup address not found'));
    }

    // Process each item in itemIds
    for (const item of itemIds) {
      const { itemId, desiredColor, desiredSize, exchangeReason, exchangeSpecificReason } = item;

      // Find order detail for the item by itemId
      const orderDetail = order.orderDetails.find(
        (detail) => detail.itemId.toString() === itemId.toString()
      );
      if (!orderDetail) {
        console.log(`Item not found in order details: ${itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json(apiResponse(404, false, `Item with ID ${itemId} not found in order details`));
      }

      // Check if return or exchange is already in progress
      if (orderDetail.isReturn) {
        console.log(`Return already in progress for item: ${itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `A return request is already in progress for item: ${itemId}`));
      }

      if (
        orderDetail.isExchange ||
        (orderDetail.exchangeInfo?.exchangeStatus && orderDetail.exchangeInfo.exchangeStatus !== 'Completed')
      ) {
        console.log(`Exchange already in progress for item: ${itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `An exchange request is already in progress for item: ${itemId}`));
      }

      // Fetch item details
      const itemDetail = await ItemDetail.findOne({ itemId }).session(session);
      if (!itemDetail) {
        console.log(`Item details not found for item: ${itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json(apiResponse(404, false, `Item details not found for item: ${itemId}`));
      }

      // Validate desiredColor availability
      const colorEntry = itemDetail.imagesByColor.find(
        (entry) => entry.color.toLowerCase() === desiredColor.toLowerCase()
      );
      if (!colorEntry) {
        console.log(`Color not available: ${desiredColor} for item: ${itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Color ${desiredColor} is not available for item: ${itemId}`));
      }

      // Validate desiredSize availability
      const sizeEntry = colorEntry.sizes.find(
        (s) => s.size.toLowerCase() === desiredSize.toLowerCase()
      );
      if (!sizeEntry) {
        const availableSizes = colorEntry.sizes.map((s) => s.size).join(', ');
        console.log(`Size not available: ${desiredSize} for item: ${itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Size ${desiredSize} is not available for item: ${itemId}. Available sizes for color ${desiredColor}: ${availableSizes}`));
      }

      // Check stock availability for replacement item
      if (sizeEntry.stock < orderDetail.quantity) {
        console.log(`Insufficient stock for size: ${desiredSize}, item: ${itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, `Requested size ${desiredSize} has insufficient stock for quantity ${orderDetail.quantity} for item: ${itemId}`));
      }

      // Fetch item for price validation
      const itemData = await Item.findById(itemId).session(session);
      if (!itemData) {
        console.log(`Item not found: ${itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json(apiResponse(404, false, `Item with ID ${itemId} not found`));
      }

      // Validate price consistency (same itemId ensures same price)
      const originalPrice = itemData.discountedPrice || itemData.MRP;
      const newPrice = originalPrice; // Same itemId, so price remains the same
      if (originalPrice !== newPrice) {
        console.log(`Price mismatch for item: ${itemId}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, 'Exchange is only allowed for products with the same price'));
      }

      // Prepare exchange info
      const exchangeInfo = {
        exchangeReason,
        exchangeSpecificReason,
        color: orderDetail.color, // Use existing color from orderDetail
        size: orderDetail.size, // Use existing size from orderDetail
        skuId: orderDetail.skuId, // Use existing skuId from orderDetail
        desiredColor,
        desiredSize,
        isSizeAvailability: true,
        requestDate: new Date(),
        pickupLocationId,
        exchangeStatus: 'Initiated',
      };

      // Update order detail
      orderDetail.isExchange = true;
      orderDetail.desiredColor = desiredColor; // Save desiredColor at orderDetails level
      orderDetail.desiredSize = desiredSize; // Save desiredSize at orderDetails level
      orderDetail.exchangeInfo = exchangeInfo;
    }

    // Update order status based on isExchange status of all items
    const allItemsExchanged = order.orderDetails.every(detail => detail.isExchange);
    if (allItemsExchanged) {
      order.orderStatus = 'Exchanged';
    } else {
      order.orderStatus = 'Partially Exchanged';
    }

    // Save order updates
    await order.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Populate order details
    const enrichedOrder = await populateOrderDetails(order, userId);

    // Log success and return response
    console.log(`Exchange request initiated successfully for orderId: ${orderId}`, requestId);
    return res.status(200).json(
      apiResponse(200, true, 'Exchange request initiated successfully', { order: enrichedOrder })
    );
  } catch (error) {
    // Roll back transaction on error
    await session.abortTransaction();
    session.endSession();
    console.log(`Error processing return and exchange: ${error.message}`, requestId);
    return res.status(500).json(
      apiResponse(500, false, error.message || 'Error while processing return and exchange')
    );
  }
};

// Fetch all orders for a user
exports.FetchOrderHistory = async (req, res) => {
  try {
    const { userId } = req.user;
    console.log("Starting FetchOrderHistory for userId:", userId);

    // Validate userId
    console.log("Validating userId:", userId);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log("Invalid userId detected:", userId);
      return res.status(400).json(apiResponse(400, false, "Invalid userId"));
    }

    // Fetch orders
    console.log("Fetching orders for userId:", userId);
    const orders = await UserOrder.find({ userId }).sort({ createdAt: -1 });
    console.log("Orders fetched:", orders.length, "orders found");

    // Check if orders exist
    if (!orders || orders.length === 0) {
      console.log("No orders found for userId:", userId);
      return res.status(200).json(apiResponse(200, true, "No user orders found", []));
    }

    // Populate order details
    console.log("Populating order details for", orders.length, "orders");
    const enrichedOrders = await populateOrderDetails(orders, userId);
    console.log("Enriched orders:", JSON.stringify(enrichedOrders, null, 2));

    // Success response
    console.log("User orders fetched successfully for userId:", userId);
    return res.status(200).json(apiResponse(200, true, "User orders fetched successfully", enrichedOrders));
  } catch (error) {
    console.error("Error fetching user orders for userId:", userId, "Error:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message || "Error fetching user orders"));
  }
};

// Fetch all orders for a user by admin
exports.FetchOrderHistoryByAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid userId"));
    }
    const orders = await UserOrder.find({ userId }).sort({ createdAt: -1 });
    if (!orders || orders.length === 0) {
      return res.status(200).json(apiResponse(200, true, "No user orders found", []));
    }
    const enrichedOrders = await populateOrderDetails(orders, userId);
    console.log(`User orders fetched successfully for user: ${userId}`);
    return res.status(200).json(apiResponse(200, true, "User orders fetched successfully", enrichedOrders));
  } catch (error) {
    console.log(`Error fetching user orders: ${error.message}`, randomUUID());
    return res.status(500).json(apiResponse(500, false, error.message || "Error fetching user orders"));
  }
};

// Fetch a specific order by orderId
exports.fetchOrderByOrderId = async (req, res) => {
  const requestId = randomUUID();

  try {
    console.log("Fetching specific order", requestId);
    const { userId } = req.user;
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid userId"));
    }

    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      return res.status(400).json(apiResponse(400, false, "Valid orderId is required"));
    }

    const specificOrder = await UserOrder.findOne({ userId, orderId });
    if (!specificOrder) {
      return res.status(404).json(apiResponse(404, false, "Order not found for this user"));
    }

    const enrichedOrder = await populateOrderDetails(specificOrder, userId);
    console.log(`Order fetched successfully: ${orderId}`, requestId);
    return res.status(200).json(apiResponse(200, true, "Order fetched successfully", enrichedOrder));
  } catch (error) {
    console.log(`Error fetching order: ${error.message}`, requestId);
    return res.status(500).json(apiResponse(500, false, error.message || "Error fetching order"));
  }
};