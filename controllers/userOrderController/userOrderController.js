


const mongoose = require("mongoose");
const UserOrder = require("../../models/User/UserOrder");
const UserCart = require("../../models/User/UserCart");
const UserAddress = require("../../models/User/UserAddress");
const Item = require("../../models/Items/Item");
const ItemDetail = require("../../models/Items/ItemDetail");
const User = require("../../models/User/User");
const { apiResponse } = require("../../utils/apiResponse");
const { randomUUID } = require("crypto");
const phonepeClient = require("../../config/phonepeClient");
const { StandardCheckoutPayRequest, RefundRequest } = require("pg-sdk-node");

// Simple logging function to track actions and errors with timestamps and request IDs
const log = (message, requestId) => {
  console.log(`[${new Date().toISOString()}] [RequestID: ${requestId}] ${message}`);
};

// Retry helper for PhonePe API calls to handle transient failures with exponential backoff
const withRetry = async (operation, maxRetries = 3, baseDelay = 1000, requestId) => {
  // Attempt the operation up to maxRetries times
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Execute operation with a 10-second timeout
      return await Promise.race([
        operation(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("PhonePe API timeout")), 10000)
        ),
      ]);
    } catch (error) {
      // Log failure and retry unless it's the last attempt
      log(`Attempt ${attempt} failed: ${error.message}`, requestId);
      if (attempt === maxRetries) throw error;
      // Apply exponential backoff delay before next attempt
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// Helper function to validate order items and update stock atomically
const validateAndUpdateStock = async (orderDetails, session, requestId) => {
  // Iterate through each order item to validate and update stock
  for (const orderItem of orderDetails) {
    // Validate itemId
    if (!orderItem.itemId || !mongoose.Types.ObjectId.isValid(orderItem.itemId)) {
      throw new Error("Valid itemId is required");
    }
    // Validate quantity
    if (!orderItem.quantity || typeof orderItem.quantity !== "number" || orderItem.quantity < 1) {
      throw new Error("Valid quantity (minimum 1) is required");
    }
    // Validate size
    if (!orderItem.size || typeof orderItem.size !== "string" || orderItem.size.trim() === "") {
      throw new Error("Valid size is required");
    }
    // Validate color
    if (!orderItem.color || typeof orderItem.color !== "string" || orderItem.color.trim() === "") {
      throw new Error("Valid color is required");
    }
    // Validate skuId
    if (!orderItem.skuId || typeof orderItem.skuId !== "string" || orderItem.skuId.trim() === "") {
      throw new Error("Valid skuId is required");
    }

    // Fetch item details from ItemDetail collection
    const itemDetail = await ItemDetail.findOne({ itemId: orderItem.itemId }).session(session);
    if (!itemDetail) {
      throw new Error(`Item detail for itemId ${orderItem.itemId} not found`);
    }

    // Check if the requested color exists
    const colorEntry = itemDetail.imagesByColor.find(
      (entry) => entry.color.toLowerCase() === orderItem.color.toLowerCase()
    );
    if (!colorEntry) {
      throw new Error(`Color ${orderItem.color} not found for itemId ${orderItem.itemId}`);
    }

    // Check if the requested size and skuId exist
    const sizeEntry = colorEntry.sizes.find(
      (s) => s.size === orderItem.size && s.skuId === orderItem.skuId
    );
    if (!sizeEntry) {
      throw new Error(
        `Size ${orderItem.size} with skuId ${orderItem.skuId} not found for itemId ${orderItem.itemId}`
      );
    }

    // Verify sufficient stock
    if (!sizeEntry.stock || sizeEntry.stock < orderItem.quantity) {
      throw new Error(
        `Insufficient stock for itemId ${orderItem.itemId}, size ${orderItem.size}, skuId ${orderItem.skuId}. Available: ${sizeEntry.stock || 0}, Requested: ${orderItem.quantity}`
      );
    }

    // Update stock by decrementing the requested quantity
    await ItemDetail.updateOne(
      {
        itemId: orderItem.itemId,
        "imagesByColor.color": orderItem.color,
        "imagesByColor.sizes.size": orderItem.size,
        "imagesByColor.sizes.skuId": orderItem.skuId,
      },
      {
        $inc: {
          "imagesByColor.$[color].sizes.$[size].stock": -orderItem.quantity,
        },
      },
      {
        arrayFilters: [
          { "color.color": orderItem.color },
          { "size.size": orderItem.size, "size.skuId": orderItem.skuId },
        ],
        session,
      }
    );
  }
};

// Function to enrich order data with user, item, address, and image details
const populateOrderDetails = async (orders, userId) => {
  try {
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid userId");
    }

    // Ensure orders is an array for consistent processing
    const ordersArray = Array.isArray(orders) ? orders : [orders];

    // Populate user details for orders
    const populatedOrders = await UserOrder.populate(ordersArray, {
      path: "userId",
      model: "User",
      select: "name email phone role",
    });

    // Process each order to enrich details
    const enrichedOrders = await Promise.all(
      populatedOrders.map(async (order) => {
        // Populate item details for order items
        const populatedOrder = await UserOrder.populate(order, {
          path: "orderDetails.itemId",
          model: "Item",
          select: "name description MRP discountedPrice",
        });

        let shippingAddress = null;
        let pickupLocation = null;

        // Fetch shipping address if provided
        if (
          order.shippingAddressId &&
          mongoose.Types.ObjectId.isValid(order.shippingAddressId)
        ) {
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
                shippingAddress = {
                  _id: matchedAddress._id,
                  name: matchedAddress.name,
                  phoneNumber: matchedAddress.phoneNumber,
                  email: matchedAddress.email,
                  pincode: matchedAddress.pincode,
                  addressLine1: matchedAddress.addressLine1,
                  addressLine2: matchedAddress.addressLine2 || "",
                  cityTown: matchedAddress.cityTown,
                  state: matchedAddress.state,
                  country: matchedAddress.country,
                  addressType: matchedAddress.addressType,
                  isDefault: matchedAddress.isDefault,
                };
              }
            }
          } catch (error) {
            console.error(
              `[populateOrderDetails] Error fetching shippingAddressId ${order.shippingAddressId} for order ${order.orderId}:`,
              error.message
            );
          }
        }

        // Enrich each order detail with item and image data
        const enrichedOrderDetails = await Promise.all(
          populatedOrder.orderDetails.map(async (detail) => {
            let image = null;

            // Fetch primary image for the item
            try {
              const itemDetail = await ItemDetail.findOne({
                itemId: detail.itemId._id,
              });
              if (itemDetail) {
                const colorEntry = itemDetail.imagesByColor.find(
                  (entry) => entry.color.toLowerCase() === detail.color.toLowerCase()
                );
                if (colorEntry) {
                  const sizeEntry = colorEntry.sizes.find(
                    (s) => s.size === detail.size && s.skuId === detail.skuId
                  );
                  if (sizeEntry && colorEntry.images && colorEntry.images.length > 0) {
                    const sortedImages = colorEntry.images.sort(
                      (a, b) => (a.priority || 0) - (b.priority || 0)
                    );
                    image = sortedImages[0]?.url || null;
                  }
                }
              }
            } catch (error) {
              console.error(
                `[populateOrderDetails] Error fetching image for itemId ${detail.itemId._id}, color ${detail.color}, size ${detail.size}, skuId ${detail.skuId}:`,
                error.message
              );
            }

            // Fetch pickup location for return
            if (
              detail.returnInfo &&
              detail.returnInfo.pickupLocationId &&
              mongoose.Types.ObjectId.isValid(detail.returnInfo.pickupLocationId)
            ) {
              try {
                const userAddress = await UserAddress.findOne({
                  userId: order.userId._id,
                  "addressDetail._id": detail.returnInfo.pickupLocationId,
                });
                if (userAddress) {
                  const matchedAddress = userAddress.addressDetail.find(
                    (addr) =>
                      addr._id.toString() === detail.returnInfo.pickupLocationId.toString()
                  );
                  if (matchedAddress) {
                    pickupLocation = {
                      _id: matchedAddress._id,
                      name: matchedAddress.name,
                      phoneNumber: matchedAddress.phoneNumber,
                      email: matchedAddress.email,
                      pincode: matchedAddress.pincode,
                      addressLine1: matchedAddress.addressLine1,
                      addressLine2: matchedAddress.addressLine2 || "",
                      cityTown: matchedAddress.cityTown,
                      state: matchedAddress.state,
                      country: matchedAddress.country,
                      addressType: matchedAddress.addressType,
                      isDefault: matchedAddress.isDefault,
                    };
                    detail.returnInfo.pickupLocationId = pickupLocation;
                  }
                }
              } catch (error) {
                console.error(
                  `[populateOrderDetails] Error fetching pickupLocationId ${detail.returnInfo.pickupLocationId} for order ${order.orderId}:`,
                  error.message
                );
              }
            }

            // Fetch pickup location for exchange
            if (
              detail.exchangeInfo &&
              detail.exchangeInfo.pickupLocationId &&
              mongoose.Types.ObjectId.isValid(detail.exchangeInfo.pickupLocationId)
            ) {
              try {
                const userAddress = await UserAddress.findOne({
                  userId: order.userId._id,
                  "addressDetail._id": detail.exchangeInfo.pickupLocationId,
                });
                if (userAddress) {
                  const matchedAddress = userAddress.addressDetail.find(
                    (addr) =>
                      addr._id.toString() === detail.exchangeInfo.pickupLocationId.toString()
                  );
                  if (matchedAddress) {
                    pickupLocation = {
                      _id: matchedAddress._id,
                      name: matchedAddress.name,
                      phoneNumber: matchedAddress.phoneNumber, // Fixed typo: matedAddress -> matchedAddress
                      email: matchedAddress.email,
                      pincode: matchedAddress.pincode,
                      addressLine1: matchedAddress.addressLine1,
                      addressLine2: matchedAddress.addressLine2 || "",
                      cityTown: matchedAddress.cityTown,
                      state: matchedAddress.state,
                      country: matchedAddress.country,
                      addressType: matchedAddress.addressType,
                      isDefault: matchedAddress.isDefault,
                    };
                    detail.exchangeInfo.pickupLocationId = pickupLocation;
                  }
                }
              } catch (error) {
                console.error(
                  `[populateOrderDetails] Error fetching pickupLocationId ${detail.exchangeInfo.pickupLocationId} for order ${order.orderId}:`,
                  error.message
                );
              }
            }

            // Return enriched order detail
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
              returnInfo: detail.returnInfo
                ? {
                    ...detail.returnInfo.toObject(),
                    pickupLocationId: detail.returnInfo.pickupLocationId,
                  }
                : null,
              exchangeInfo: detail.exchangeInfo
                ? {
                    ...detail.exchangeInfo.toObject(),
                    pickupLocationId: detail.exchangeInfo.pickupLocationId,
                  }
                : null,
            };
          })
        );

        // Return enriched order
        return {
          ...populatedOrder.toObject(),
          shippingAddressId: shippingAddress,
          orderDetails: enrichedOrderDetails,
        };
      })
    );

    // Return single order or array based on input
    return Array.isArray(orders) ? enrichedOrders : enrichedOrders[0];
  } catch (error) {
    console.error("Error populating order details:", error.message);
    throw error;
  }
};



// Controller to create a new order (COD or Online)
exports.createUserOrder = async (req, res) => {
  // Start a MongoDB transaction session for atomic operations
  const session = await mongoose.startSession();
  session.startTransaction();
  // Generate a unique request ID for logging
  const requestId = randomUUID();

  try {
    // Log the start of order creation
    log("Creating new order", requestId);
    // Extract userId from authenticated user and request body details
    const { userId } = req.user;
    const { orderDetails, invoice, shippingAddressId, paymentMethod, totalAmount } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Invalid userId"));
    }

    // Validate orderDetails array
    if (!orderDetails || !Array.isArray(orderDetails) || orderDetails.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "orderDetails array is required and cannot be empty")
      );
    }

    // Validate invoice array
    if (!Array.isArray(invoice) || invoice.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "Non-empty invoice array is required")
      );
    }

    // Validate each invoice entry
    for (const entry of invoice) {
      if (!entry.key || typeof entry.key !== "string" || entry.key.trim() === "") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, "Each invoice entry must have a valid key")
        );
      }
      if (!entry.values || typeof entry.values !== "string" || entry.values.trim() === "") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, "Each invoice entry must have valid values")
        );
      }
    }

    // Validate totalAmount
    if (typeof totalAmount !== "number" || totalAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "Valid totalAmount is required and must be positive")
      );
    }

    // Validate paymentMethod
    if (!paymentMethod || !["Online", "COD"].includes(paymentMethod)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "Valid payment method (Online or COD) is required")
      );
    }

    // Validate shippingAddressId if provided
    if (shippingAddressId) {
      if (!mongoose.Types.ObjectId.isValid(shippingAddressId)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, "Invalid shippingAddressId")
        );
      }
      // Check if the address exists for the user
      const addressExists = await UserAddress.findOne({
        userId,
        "addressDetail._id": shippingAddressId,
      }).session(session);
      if (!addressExists) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json(
          apiResponse(404, false, "Shipping address not found")
        );
      }
    }

    // Fetch user cart
    const userCart = await UserCart.findOne({ userId }).session(session);
    if (!userCart) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(
        apiResponse(404, false, "User cart not found")
      );
    }

    // Calculate subtotal from orderDetails
    let subtotal = 0;
    for (const orderItem of orderDetails) {
      // Validate itemId
      if (!orderItem.itemId || !mongoose.Types.ObjectId.isValid(orderItem.itemId)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, "Valid itemId is required")
        );
      }
      // Validate quantity
      if (!orderItem.quantity || typeof orderItem.quantity !== "number" || orderItem.quantity < 1) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, "Valid quantity (minimum 1) is required")
        );
      }
      // Validate size
      if (!orderItem.size || typeof orderItem.size !== "string" || orderItem.size.trim() === "") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, "Valid size is required")
        );
      }
      // Validate color
      if (!orderItem.color || typeof orderItem.color !== "string" || orderItem.color.trim() === "") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, "Valid color is required")
        );
      }
      // Validate skuId
      if (!orderItem.skuId || typeof orderItem.skuId !== "string" || orderItem.skuId.trim() === "") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, "Valid skuId is required")
        );
      }

      // Check if item exists in cart
      const cartItem = userCart.items.find(
        (item) =>
          item.itemId.toString() === orderItem.itemId.toString() &&
          item.size === orderItem.size &&
          item.color === orderItem.color &&
          item.skuId === orderItem.skuId
      );
      if (!cartItem) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json(
          apiResponse(
            404,
            false,
            `Cart item with itemId ${orderItem.itemId}, size ${orderItem.size}, color ${orderItem.color}, skuId ${orderItem.skuId} not found`
          )
        );
      }

      // Fetch item details to get discountedPrice
      const item = await Item.findById(orderItem.itemId).session(session);
      if (!item) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json(
          apiResponse(404, false, `Item with ID ${orderItem.itemId} not found`)
        );
      }

      // Use discountedPrice or MRP if discountedPrice is not available
      const itemPrice = item.discountedPrice || item.MRP;
      if (typeof itemPrice !== "number" || itemPrice <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, `Invalid price for itemId ${orderItem.itemId}`)
        );
      }

      // Add to subtotal (discountedPrice * quantity)
      subtotal += itemPrice * orderItem.quantity;
    }

    // Extract invoice details
    const invoiceDetails = {
      gst: 0,
      couponDiscount: 0,
      shippingCharge: 0,
      codCharge: 0,
    };

    // Parse invoice entries
    for (const entry of invoice) {
      const key = entry.key.trim().toLowerCase();
      const value = parseFloat(entry.values);
      if (isNaN(value) || value < 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, `Invalid invoice value for key "${key}": ${entry.values}`)
        );
      }
      switch (key) {
        case "gst":
          invoiceDetails.gst = value;
          break;
        case "coupon discount":
          invoiceDetails.couponDiscount = value;
          break;
        case "shipping charge":
          invoiceDetails.shippingCharge = value;
          break;
        case "cod charge":
          invoiceDetails.codCharge = value;
          break;
        default:
          // Ignore unrecognized keys
          break;
      }
    }

    // Validate required invoice entries
    if (invoiceDetails.gst === 0 && subtotal > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "GST value is required in invoice when subtotal is positive")
      );
    }

    // Validate coupon discount
    if (invoiceDetails.couponDiscount < 0 || invoiceDetails.couponDiscount > subtotal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(
          400,
          false,
          `Invalid coupon discount: ${invoiceDetails.couponDiscount}. Must be non-negative and not exceed subtotal (${subtotal.toFixed(2)})`
        )
      );
    }

    // Validate shipping charge (assumed 0; adjust if dynamic)
    if (invoiceDetails.shippingCharge !== 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(
          400,
          false,
          `Shipping charge mismatch. Expected: 0, Received: ${invoiceDetails.shippingCharge.toFixed(2)}`
        )
      );
    }

    // Calculate total amount using invoice values
    const calculatedTotalAmount =
      subtotal +
      invoiceDetails.gst +
      (paymentMethod === "COD" ? invoiceDetails.codCharge : 0) +
      invoiceDetails.shippingCharge -
      invoiceDetails.couponDiscount;

    // Validate calculated total against provided totalAmount
    if (Math.abs(calculatedTotalAmount - totalAmount) > 0.01) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(
          400,
          false,
          `Total amount mismatch. Expected: ${calculatedTotalAmount.toFixed(2)}, Received: ${totalAmount.toFixed(2)}`
        )
      );
    }

    // Update stock for COD orders
    if (paymentMethod === "COD") {
      await validateAndUpdateStock(orderDetails, session, requestId);
    }

    // Generate unique order and merchant IDs
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const merchantOrderId = randomUUID();

    // Prepare order data
    const orderData = {
      orderId,
      userId,
      orderDetails: orderDetails.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        size: item.size,
        color: item.color,
        skuId: item.skuId,
        addedAt: new Date(),
        isReturn: false,
        isExchange: false,
      })),
      invoice: invoice.map((entry) => ({
        key: entry.key.trim().toLowerCase(),
        values: entry.values.trim(),
      })),
      shippingAddressId,
      paymentMethod,
      isOrderPlaced: false,
      totalAmount,
      orderStatus: "Initiated",
      paymentStatus: "Pending",
      phonepeOrderId: null,
      phonepeMerchantOrderId: null,
      checkoutPageUrl: null,
      isOrderCancelled: false,
      deliveryDate: null,
      couponDiscount: invoiceDetails.couponDiscount,
    };

    // Handle COD orders
    if (paymentMethod === "COD") {
      orderData.isOrderPlaced = true;
      orderData.orderStatus = "Confirmed";
      orderData.paymentStatus = "Pending";
    } else if (paymentMethod === "Online") {
      // Create PhonePe payment request
      const request = StandardCheckoutPayRequest.builder()
        .merchantOrderId(merchantOrderId)
        .amount(totalAmount * 100) // Convert to paise
        .redirectUrl(process.env.PHONEPE_REDIRECT_URL || "https://your-merchant.com/redirect")
        .build();

      // Initiate payment with retry logic
      const response = await withRetry(
        () => phonepeClient.initiatePayment(request),
        3,
        1000,
        requestId
      );
      orderData.phonepeOrderId = response.orderId;
      orderData.phonepeMerchantOrderId = merchantOrderId;
      orderData.checkoutPageUrl = response.redirectUrl;
    }

    // Save the order
    const newOrder = new UserOrder(orderData);
    const savedOrder = await newOrder.save({ session });

    // Remove ordered items from cart
    userCart.items = userCart.items.filter(
      (cartItem) =>
        !orderDetails.some(
          (orderItem) =>
            orderItem.itemId.toString() === cartItem.itemId.toString() &&
            orderItem.size === cartItem.size &&
            orderItem.color === cartItem.color &&
            orderItem.skuId === cartItem.skuId
        )
    );
    await userCart.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Populate order details with additional data
    const populatedOrder = await populateOrderDetails(savedOrder, userId);

    // Add checkout URL for online payments
    if (paymentMethod === "Online") {
      populatedOrder.checkoutPageUrl = savedOrder.checkoutPageUrl;
    }

    // Log success and return response
    log(`Order created successfully: ${orderId}`, requestId);
    return res.status(201).json(
      apiResponse(201, true, "Order created successfully", populatedOrder)
    );
  } catch (error) {
    // Roll back transaction on error
    await session.abortTransaction();
    session.endSession();
    log(`Error creating order: ${error.message}`, requestId);
    return res.status(400).json(
      apiResponse(400, false, error.message || "Error while creating order")
    );
  }
};

// Controller to verify payment status for Online orders
exports.verifyPayment = async (req, res) => {
  // Start a MongoDB transaction session
  const session = await mongoose.startSession();
  session.startTransaction();
  // Generate a unique request ID for logging
  const requestId = randomUUID();

  try {
    // Log the start of payment verification
    log("Verifying payment", requestId);
    // Extract userId and phonepeMerchantOrderId
    const { userId } = req.user;
    const { phonepeMerchantOrderId } = req.body;

    // Validate phonepeMerchantOrderId
    if (!phonepeMerchantOrderId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Missing phonepeMerchantOrderId"));
    }

    // Find order by merchant order ID and userId
    const userOrder = await UserOrder.findOne({ phonepeMerchantOrderId, userId }).session(session);
    if (!userOrder) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "Order not found or not authorized"));
    }

    // Check if order is expired (older than 30 minutes)
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

    // Check if payment is already processed
    if (["Paid", "Failed", "Expired"].includes(userOrder.paymentStatus)) {
      await session.commitTransaction();
      session.endSession();
      const populatedOrder = await populateOrderDetails(userOrder, userId);
      return res.status(200).json(
        apiResponse(200, true, `Payment already processed as ${userOrder.paymentStatus}`, populatedOrder)
      );
    }

    // Check payment status with PhonePe
    const response = await withRetry(
      () => phonepeClient.checkStatus(phonepeMerchantOrderId),
      3,
      1000,
      requestId
    );

    // Handle payment states
    switch (response.state) {
      case "COMPLETED":
        try {
          // Update stock for order items
          await validateAndUpdateStock(userOrder.orderDetails, session, requestId);

          // Update order status
          const updatedOrder = await UserOrder.findOneAndUpdate(
            { phonepeMerchantOrderId, userId },
            {
              $set: {
                paymentStatus: "Paid",
                isOrderPlaced: true,
                orderStatus: "Confirmed",
              },
            },
            { new: true, session }
          );

          // Commit transaction
          await session.commitTransaction();
          session.endSession();

          // Populate order details
          const populatedOrder = await populateOrderDetails(updatedOrder, userId);
          log(`Payment verified successfully: ${phonepeMerchantOrderId}`, requestId);
          return res.status(200).json(
            apiResponse(200, true, "Payment verified and stock updated successfully", populatedOrder)
          );
        } catch (stockError) {
          // Handle stock errors within transaction
          if (stockError.message.includes("Insufficient stock")) {
            await UserOrder.findOneAndUpdate(
              { phonepeMerchantOrderId, userId },
              { $set: { paymentStatus: "Failed", orderStatus: "Cancelled", isOrderCancelled: true } },
              { session }
            );
            await session.commitTransaction();
            session.endSession();
            log(`Stock error during payment verification: ${stockError.message}`, requestId);
            return res.status(400).json(apiResponse(400, false, stockError.message));
          }
          throw stockError;
        }

      case "FAILED":
      case "ATTEMPT_FAILED":
        // Update order for failed payment
        await UserOrder.findOneAndUpdate(
          { phonepeMerchantOrderId, userId },
          { $set: { paymentStatus: "Failed", orderStatus: "Cancelled", isOrderCancelled: true } },
          { session }
        );

        // Commit transaction
        await session.commitTransaction();
        session.endSession();
        log(`Payment failed: ${phonepeMerchantOrderId}`, requestId);
        return res.status(400).json(apiResponse(400, false, "Payment failed"));

      case "PENDING":
      case "INITIATED":
        // Handle pending states
        await session.commitTransaction();
        session.endSession();
        return res.status(200).json(apiResponse(200, false, "Payment is still pending"));

      default:
        // Handle unexpected states
        await session.commitTransaction();
        session.endSession();
        log(`Unexpected payment state: ${response.state} for ${phonepeMerchantOrderId}`, requestId);
        return res.status(400).json(apiResponse(400, false, `Unexpected payment state: ${response.state}`));
    }
  } catch (error) {
    // Roll back transaction on error
    await session.abortTransaction();
    session.endSession();
    log(`Error verifying payment: ${error.message}`, requestId);
    return res.status(500).json(
      apiResponse(500, false, error.message || "Error verifying payment")
    );
  }
};

// Controller to handle PhonePe server-to-server callbacks
exports.handlePhonePeCallback = async (req, res) => {
  // Start a MongoDB transaction session
  const session = await mongoose.startSession();
  session.startTransaction();
  // Generate a unique request ID for logging
  const requestId = randomUUID();

  try {
    // Log the start of callback processing
    log("Processing PhonePe callback", requestId);
    // Extract authorization header and response body
    const authorizationHeader = req.headers["authorization"];
    const responseBody = JSON.stringify(req.body);

    // Validate callback parameters
    if (!authorizationHeader || !responseBody) {
      await session.abortTransaction();
      session.endSession();
      log("Missing callback parameters", requestId);
      return res.status(400).json(apiResponse(400, false, "Missing callback parameters"));
    }

    // Extract callback data (simplified; adjust based on PhonePe documentation)
    const callbackResponse = req.body;
    const { orderId, state } = callbackResponse;

    // Find order by PhonePe order ID
    const order = await UserOrder.findOne({ phonepeOrderId: orderId }).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      log(`Order not found: ${orderId}`, requestId);
      return res.status(404).json(apiResponse(404, false, "Order not found"));
    }

    // Check if callback is already processed
    if (["Paid", "Failed", "Expired"].includes(order.paymentStatus)) {
      await session.commitTransaction();
      session.endSession();
      log(`Callback already processed for order: ${orderId}, status: ${order.paymentStatus}`, requestId);
      return res.status(200).json(apiResponse(200, true, `Callback already processed as ${order.paymentStatus}`));
    }

    // Handle completed payment
    if (state === "COMPLETED") {
      await validateAndUpdateStock(order.orderDetails, session, requestId);
      order.paymentStatus = "Paid";
      order.isOrderPlaced = true;
      order.orderStatus = "Confirmed";
    } else if (state === "FAILED" || state === "ATTEMPT_FAILED") {
      // Handle failed payment
      order.paymentStatus = "Failed";
      order.orderStatus = "Cancelled";
      order.isOrderCancelled = true;
    } else {
      // No action for other states
      await session.commitTransaction();
      session.endSession();
      log(`Callback state ${state} requires no action for order: ${orderId}`, requestId);
      return res.status(200).json(apiResponse(200, true, "Callback received but no action taken"));
    }

    // Save order updates
    await order.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Log success and return response
    log(`Callback processed successfully for order: ${orderId}, state: ${state}`, requestId);
    return res.status(200).json(apiResponse(200, true, "Callback processed successfully"));
  } catch (error) {
    // Roll back transaction on error
    await session.abortTransaction();
    session.endSession();
    log(`Error processing callback: ${error.message}`, requestId);
    return res.status(400).json(apiResponse(400, false, "Error processing callback"));
  }
};

// Controller to cancel an order
exports.cancelOrder = async (req, res) => {
  // Start a MongoDB transaction session
  const session = await mongoose.startSession();
  session.startTransaction();
  // Generate a unique request ID for logging
  const requestId = randomUUID();

  try {
    // Log the start of order cancellation
    log("Cancelling order", requestId);
    // Extract userId and request body details
    const { userId } = req.user;
    const { orderId, refundReason } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Invalid userId"));
    }

    // Validate orderId
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid orderId is required"));
    }

    // Find order
    const order = await UserOrder.findOne({ orderId, userId }).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "Order not found"));
    }

    // Check if order is already cancelled
    if (order.isOrderCancelled) {
      await session.commitTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Order is already cancelled"));
    }

    // Check if order is in a non-cancellable state
    const nonCancellableStatuses = ["Dispatched", "Delivered", "Returned"];
    if (nonCancellableStatuses.includes(order.orderStatus)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(
          400,
          false,
          `Order cannot be cancelled in ${order.orderStatus} status. Cancellation is only allowed before shipping.`
        )
      );
    }

    // Calculate total refund amount
    let totalRefundAmount = 0;
    for (const detail of order.orderDetails) {
      const item = await Item.findById(detail.itemId).session(session);
      if (!item) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json(
          apiResponse(404, false, `Item with ID ${detail.itemId} not found`)
        );
      }

      const itemPrice = item.discountedPrice || item.MRP;
      const quantity = detail.quantity || 1;
      totalRefundAmount += itemPrice * quantity;
    }

    // Update order status
    order.orderStatus = "Cancelled";
    order.isOrderCancelled = true;

    // Handle refunds for COD
    if (order.paymentMethod === "COD") {
      order.refund = {
        refundReason,
        requestDate: new Date(),
      };
    } else if (order.paymentMethod === "Online" && order.paymentStatus === "Paid") {
      // Validate merchant order ID
      if (!order.phonepeMerchantOrderId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, "No valid PhonePe merchant order ID found")
        );
      }

      // Check if refund is already initiated
      if (order.refund && order.refund.refundTransactionId) {
        await session.commitTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, "Refund already initiated"));
      }

      // Initiate refund
      const merchantRefundId = randomUUID();
      const request = RefundRequest.builder()
        .merchantRefundId(merchantRefundId)
        .originalMerchantOrderId(order.phonepeMerchantOrderId)
        .amount(totalRefundAmount * 100)
        .build();

      const refund = await withRetry(
        () => phonepeClient.initiateRefund(request),
        3,
        1000,
        requestId
      );

      // Update order with refund details
      order.refund = {
        refundReason,
        requestDate: new Date(),
        refundAmount: totalRefundAmount,
        refundTransactionId: refund.refundId,
        merchantRefundId,
        refundStatus: "Processing",
      };
    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "Refunds are only applicable for online paid orders or COD")
      );
    }

    // Save order updates
    await order.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Populate order details
    const enrichedOrder = await populateOrderDetails(order, userId);

    // Log success and return response
    log(`Order cancelled successfully: ${orderId}`, requestId);
    return res.status(200).json(
      apiResponse(200, true, "Order cancelled successfully", enrichedOrder)
    );
  } catch (error) {
    // Roll back transaction on error
    await session.abortTransaction();
    session.endSession();
    log(`Error cancelling order: ${error.message}`, requestId);
    return res.status(500).json(
      apiResponse(500, false, error.message || "Error while cancelling order")
    );
  }
};


// Controller to process return and refund requests
exports.returnRefund = async (req, res) => {
  // Start a MongoDB transaction session
  const session = await mongoose.startSession();
  session.startTransaction();
  // Generate a unique request ID for logging
  const requestId = randomUUID();

  try {
    // Log the start of return and refund processing
    log("Processing return and refund", requestId);
    // Extract userId and request body details
    const { userId } = req.user;
    const {
      orderId,
      itemId,
      color,
      size,
      skuId, // Optional, for additional precision
      returnReason,
      specificReturnReason,
      pickupLocationId,
      bankDetails,
    } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Invalid userId"));
    }

    // Validate orderId
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid orderId is required"));
    }

    // Validate itemId
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid itemId is required"));
    }

    // Validate color
    if (!color || typeof color !== "string" || color.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid color is required"));
    }

    // Validate size
    if (!size || typeof size !== "string" || size.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid size is required"));
    }

    // Validate skuId if provided
    if (skuId && (typeof skuId !== "string" || skuId.trim() === "")) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid skuId is required if provided"));
    }

    // Validate pickupLocationId
    if (!pickupLocationId || !mongoose.Types.ObjectId.isValid(pickupLocationId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid pickupLocationId is required"));
    }

    // Validate returnReason
    if (
      !returnReason ||
      ![
        "Size too small",
        "Size too big",
        "Don't like the fit",
        "Don't like the quality",
        "Not same as the catalogue",
        "Product is damaged",
        "Wrong product is received",
        "Product arrived too late",
      ].includes(returnReason)
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid returnReason is required"));
    }

    // Validate specificReturnReason
    if (
      !specificReturnReason ||
      typeof specificReturnReason !== "string" ||
      specificReturnReason.trim() === ""
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid specificReturnReason is required"));
    }

    // Validate bankDetails
    if (!bankDetails) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "bankDetails are required"));
    }

    const { accountNumber, ifscCode, bankName, accountHolderName } = bankDetails;
    if (
      !accountNumber ||
      typeof accountNumber !== "string" ||
      accountNumber.trim() === "" ||
      !ifscCode ||
      typeof ifscCode !== "string" ||
      ifscCode.trim() === "" ||
      !bankName ||
      typeof bankName !== "string" ||
      bankName.trim() === "" ||
      !accountHolderName ||
      typeof accountHolderName !== "string" ||
      accountHolderName.trim() === ""
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "Complete and valid bankDetails are required")
      );
    }

    // Find order
    const order = await UserOrder.findOne({ orderId, userId }).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "Order not found"));
    }

    // Check if order is delivered
    if (order.orderStatus !== "Delivered") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "Order must be in Delivered status to initiate a return")
      );
    }

    // Find order detail for the item by itemId, color, size, and optionally skuId
    const orderDetail = order.orderDetails.find(
      (detail) =>
        detail.itemId.toString() === itemId.toString() &&
        detail.color.toLowerCase() === color.toLowerCase() &&
        detail.size.toLowerCase() === size.toLowerCase() &&
        (!skuId || detail.skuId === skuId)
    );
    if (!orderDetail) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(
        apiResponse(
          404,
          false,
          `Item with ID ${itemId}, color ${color}, size ${size}${skuId ? `, skuId ${skuId}` : ""} not found in order details`
        )
      );
    }

    // Check if return is already in progress
    if (
      orderDetail.isReturn ||
      (orderDetail.returnInfo &&
        orderDetail.returnInfo.refundStatus &&
        orderDetail.returnInfo.refundStatus !== "Completed")
    ) {
      await session.commitTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "A return request is already in progress for this item")
      );
    }

    // Check if exchange is already in progress
    if (
      orderDetail.isExchange ||
      (orderDetail.exchangeInfo &&
        orderDetail.exchangeInfo.exchangeStatus &&
        orderDetail.exchangeInfo.exchangeStatus !== "Completed")
    ) {
      await session.commitTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "An exchange request is already in progress for this item")
      );
    }

    // Validate pickup address
    const addressExists = await UserAddress.findOne({
      userId,
      "addressDetail._id": pickupLocationId,
    }).session(session);
    if (!addressExists) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "Pickup address not found"));
    }

    // Fetch item details
    const item = await Item.findById(orderDetail.itemId).session(session);
    if (!item) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(
        apiResponse(404, false, `Item with ID ${orderDetail.itemId} not found`)
      );
    }

    // Calculate refund amount
    let refundAmount;
    const isSingleItemOrder = order.orderDetails.length === 1;

    if (isSingleItemOrder) {
      // Single-item order: Use totalAmount
      if (order.paymentMethod === "COD") {
        refundAmount = Math.max(0, order.totalAmount - 50); // Deduct ₹50 for COD
      } else if (order.paymentMethod === "Online") {
        refundAmount = order.totalAmount; // Full totalAmount
      }
    } else {
      // Multi-item order: Use discountedPrice * quantity for the specific item
      const itemPrice = item.discountedPrice || item.MRP;
      if (typeof itemPrice !== "number" || itemPrice <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, `Invalid price for itemId ${orderDetail.itemId}`)
        );
      }
      const quantity = orderDetail.quantity;
      if (typeof quantity !== "number" || quantity < 1) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, `Invalid quantity for itemId ${orderDetail.itemId}`)
        );
      }
      const itemTotal = itemPrice * quantity;
      if (order.paymentMethod === "COD") {
        refundAmount = Math.max(0, itemTotal - 50); // Deduct ₹50 for COD
      } else if (order.paymentMethod === "Online") {
        refundAmount = itemTotal; // Full item total
      }
    }

    // Validate refundAmount
    if (typeof refundAmount !== "number" || refundAmount < 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "Calculated refund amount is invalid")
      );
    }

    // Prepare return info
    const returnInfo = {
      returnReason,
      specificReturnReason,
      requestDate: new Date(),
      pickupLocationId,
      bankDetails,
      refundStatus: "Initiated",
      refundAmount,
    };

    // Handle COD refunds
    if (order.paymentMethod === "COD") {
      returnInfo.returnAndRefundTransactionId = `REF-COD-${Date.now()}`;
    } else if (order.paymentMethod === "Online" && order.paymentStatus === "Paid") {
      // Validate merchant order ID
      if (!order.phonepeMerchantOrderId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json(
          apiResponse(400, false, "No valid PhonePe merchant order ID found")
        );
      }

      // Check if refund is already initiated
      if (orderDetail.returnInfo && orderDetail.returnInfo.returnAndRefundTransactionId) {
        await session.commitTransaction();
        session.endSession();
        return res.status(400).json(apiResponse(400, false, "Refund already initiated"));
      }

      // Initiate refund
      const merchantRefundId = randomUUID();
      const request = RefundRequest.builder()
        .merchantRefundId(merchantRefundId)
        .originalMerchantOrderId(order.phonepeMerchantOrderId)
        .amount(Math.round(refundAmount * 100)) // Convert to paise
        .build();

      const refund = await withRetry(
        () => phonepeClient.initiateRefund(request),
        3,
        1000,
        requestId
      );

      // Update return info
      returnInfo.returnAndRefundTransactionId = refund.refundId;
      returnInfo.merchantRefundId = merchantRefundId;
      returnInfo.refundStatus = "Processing";
    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "Refunds are only applicable for online paid orders or COD")
      );
    }

    // Update order detail
    orderDetail.isReturn = true;
    orderDetail.returnInfo = returnInfo;
    order.orderStatus = "Returned";

    // Save order updates
    await order.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Populate order details
    const enrichedOrder = await populateOrderDetails(order, userId);

    // Log success and return response
    log(`Return and refund initiated successfully: ${orderId}`, requestId);
    return res.status(200).json(
      apiResponse(200, true, "Return and refund request initiated successfully", {
        order: enrichedOrder,
      })
    );
  } catch (error) {
    // Roll back transaction on error
    await session.abortTransaction();
    session.endSession();
    log(`Error processing return and refund: ${error.message}`, requestId);
    return res.status(500).json(
      apiResponse(500, false, error.message || "Error while processing return and refund")
    );
  }
};


// // Controller to process return and exchange requests
// exports.returnAndExchange = async (req, res) => {
//   // Start a MongoDB transaction session
//   const session = await mongoose.startSession();
//   session.startTransaction();
//   // Generate a unique request ID for logging
//   const requestId = randomUUID();

//   try {
//     // Log the start of exchange processing
//     log("Processing return and exchange", requestId);
//     // Extract userId and request body details
//     const { userId } = req.user;
//     const {
//       orderId,
//       itemId,
//       exchangeReason,
//       exchangeSpecificReason,
//       pickupLocationId,
//       color,
//       size,
//       skuId,
//     } = req.body;

//     // Validate userId
//     if (!mongoose.Types.ObjectId.isValid(userId)) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(apiResponse(400, false, "Invalid userId"));
//     }

//     // Validate orderId
//     if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(apiResponse(400, false, "Valid orderId is required"));
//     }

//     // Validate itemId
//     if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(apiResponse(400, false, "Valid itemId is required"));
//     }

//     // Validate pickupLocationId
//     if (!pickupLocationId || !mongoose.Types.ObjectId.isValid(pickupLocationId)) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(apiResponse(400, false, "Valid pickupLocationId is required"));
//     }

//     // Validate exchangeReason
//     if (
//       !exchangeReason ||
//       ![
//         "Size too small",
//         "Size too big",
//         "Don't like the fit",
//         "Don't like the quality",
//         "Not same as the catalogue",
//         "Product is damaged",
//         "Wrong product is received",
//         "Product arrived too late",
//       ].includes(exchangeReason)
//     ) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(apiResponse(400, false, "Valid exchangeReason is required"));
//     }

//     // Validate exchangeSpecificReason
//     if (
//       !exchangeSpecificReason ||
//       typeof exchangeSpecificReason !== "string" ||
//       exchangeSpecificReason.trim() === ""
//     ) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(
//         apiResponse(400, false, "Valid exchangeSpecificReason is required")
//       );
//     }

//     // Validate color
//     if (!color || typeof color !== "string" || color.trim() === "") {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(apiResponse(400, false, "Valid color is required"));
//     }

//     // Validate size
//     if (!size || typeof size !== "string" || size.trim() === "") {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(apiResponse(400, false, "Valid size is required"));
//     }

//     // Validate skuId
//     if (!skuId || typeof skuId !== "string" || skuId.trim() === "") {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(apiResponse(400, false, "Valid skuId is required"));
//     }

//     // Find order
//     const order = await UserOrder.findOne({ orderId, userId }).session(session);
//     if (!order) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json(apiResponse(404, false, "Order not found"));
//     }

//     // Check if order is delivered
//     if (order.orderStatus !== "Delivered") {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(
//         apiResponse(400, false, "Order must be in Delivered status to initiate an exchange")
//       );
//     }

//     // Find order detail for the item
//     const orderDetail = order.orderDetails.find(
//       (detail) => detail.itemId.toString() === itemId.toString()
//     );
//     if (!orderDetail) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json(apiResponse(404, false, "Item not found in order details"));
//     }

//     // Check if return is already in progress
//     if (
//       orderDetail.isReturn ||
//       (orderDetail.returnInfo &&
//         orderDetail.returnInfo.refundStatus &&
//         orderDetail.returnInfo.refundStatus !== "Completed")
//     ) {
//       await session.commitTransaction();
//       session.endSession();
//       return res.status(400).json(
//         apiResponse(400, false, "A return request is already in progress for this item")
//       );
//     }
//     // Check if exchange is already in progress
//     if (
//       orderDetail.isExchange ||
//       (orderDetail.exchangeInfo &&
//         orderDetail.exchangeInfo.exchangeStatus &&
//         orderDetail.exchangeInfo.exchangeStatus !== "Completed")
//     ) {
//       await session.commitTransaction();
//       session.endSession();
//       return res.status(400).json(
//         apiResponse(400, false, "An exchange request is already in progress for this item")
//       );
//     }

//     // Validate pickup address
//     const addressExists = await UserAddress.findOne({
//       userId,
//       "addressDetail._id": pickupLocationId,
//     }).session(session);
//     if (!addressExists) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json(apiResponse(404, false, "Pickup address not found"));
//     }

//     // Fetch item details
//     const item = await Item.findById(orderDetail.itemId).session(session);
//     if (!item) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json(
//         apiResponse(404, false, `Item with ID ${orderDetail.itemId} not found`)
//       );
//     }

//     // Fetch item detail for stock check
//     const itemDetail = await ItemDetail.findOne({ itemId: orderDetail.itemId }).session(session);
//     if (!itemDetail) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json(apiResponse(404, false, "Item details not found"));
//     }

//     // Validate color availability
//     const colorEntry = itemDetail.imagesByColor.find(
//       (entry) => entry.color.toLowerCase() === color.toLowerCase()
//     );
//     if (!colorEntry) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(
//         apiResponse(400, false, `Color ${color} not available for this item`)
//       );
//     }

//     // Validate size and skuId
//     const sizeEntry = colorEntry.sizes.find(
//       (s) => s.size === size && s.skuId === skuId
//     );
//     if (!sizeEntry) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(
//         apiResponse(400, false, `Size ${size} or skuId ${skuId} not available for color ${color}`)
//       );
//     }

//     // Check stock availability
//     if (sizeEntry.stock <= 0) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(apiResponse(400, false, `Requested size ${size} is out of stock`));
//     }

//     // Validate price consistency
//     const originalPrice = item.discountedPrice || item.MRP;
//     const newPrice = originalPrice;
//     if (originalPrice !== newPrice) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json(
//         apiResponse(400, false, "Exchange is only allowed for products with the same price")
//       );
//     }

//     // Prepare exchange info
//     const exchangeInfo = {
//       exchangeReason,
//       exchangeSpecificReason,
//       color,
//       size,
//       skuId,
//       isSizeAvailability: true,
//       requestDate: new Date(),
//       pickupLocationId,
//       exchangeStatus: "Initiated",
//     };

//     // Update order detail
//     orderDetail.isExchange = true;
//     orderDetail.exchangeInfo = exchangeInfo;
//     order.orderStatus = "Returned";

//     // Save order updates
//     await order.save({ session });

//     // Commit transaction
//     await session.commitTransaction();
//     session.endSession();

//     // Populate order details
//     const enrichedOrder = await populateOrderDetails(order, userId);

//     // Log success and return response
//     log(`Exchange request initiated successfully: ${orderId}`, requestId);
//     return res.status(200).json(
//       apiResponse(200, true, "Exchange request initiated successfully", {
//         order: enrichedOrder,
//       })
//     );
//   } catch (error) {
//     // Roll back transaction on error
//     await session.abortTransaction();
//     session.endSession();
//     log(`Error processing return and exchange: ${error.message}`, requestId);
//     return res.status(500).json(
//       apiResponse(500, false, error.message || "Error while processing return and exchange")
//     );
//   }
// };



// Controller to process return and exchange requests
exports.returnAndExchange = async (req, res) => {
  // Start a MongoDB transaction session
  const session = await mongoose.startSession();
  session.startTransaction();
  // Generate a unique request ID for logging
  const requestId = randomUUID();

  try {
    // Log the start of exchange processing
    log("Processing return and exchange", requestId);
    // Extract userId and request body details
    const { userId } = req.user;
    const {
      orderId,
      itemId,
      color,
      size,
      skuId, // For identifying the item to return
      desiredColor,
      desiredSize, // For the replacement item
      exchangeReason,
      exchangeSpecificReason,
      pickupLocationId,
    } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Invalid userId"));
    }

    // Validate orderId
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid orderId is required"));
    }

    // Validate itemId
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid itemId is required"));
    }

    // Validate color (for item to return)
    if (!color || typeof color !== "string" || color.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid color is required"));
    }

    // Validate size (for item to return)
    if (!size || typeof size !== "string" || size.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid size is required"));
    }

    // Validate skuId (for item to return)
    if (!skuId || typeof skuId !== "string" || skuId.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid skuId is required"));
    }

    // Validate desiredColor (for replacement item)
    if (!desiredColor || typeof desiredColor !== "string" || desiredColor.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid desiredColor is required"));
    }

    // Validate desiredSize (for replacement item)
    if (!desiredSize || typeof desiredSize !== "string" || desiredSize.trim() === "") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid desiredSize is required"));
    }

    // Validate pickupLocationId
    if (!pickupLocationId || !mongoose.Types.ObjectId.isValid(pickupLocationId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid pickupLocationId is required"));
    }

    // Validate exchangeReason
    if (
      !exchangeReason ||
      ![
        "Size too small",
        "Size too big",
        "Don't like the fit",
        "Don't like the quality",
        "Not same as the catalogue",
        "Product is damaged",
        "Wrong product is received",
        "Product arrived too late",
      ].includes(exchangeReason)
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(apiResponse(400, false, "Valid exchangeReason is required"));
    }

    // Validate exchangeSpecificReason
    if (
      !exchangeSpecificReason ||
      typeof exchangeSpecificReason !== "string" ||
      exchangeSpecificReason.trim() === ""
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "Valid exchangeSpecificReason is required")
      );
    }

    // Find order
    const order = await UserOrder.findOne({ orderId, userId }).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "Order not found"));
    }

    // Check if order is delivered
    if (order.orderStatus !== "Delivered") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "Order must be in Delivered status to initiate an exchange")
      );
    }

    // Find order detail for the item by itemId, color, size, and skuId
    const orderDetail = order.orderDetails.find(
      (detail) =>
        detail.itemId.toString() === itemId.toString() &&
        detail.color.toLowerCase() === color.toLowerCase() &&
        detail.size.toLowerCase() === size.toLowerCase() &&
        detail.skuId === skuId
    );
    if (!orderDetail) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(
        apiResponse(
          404,
          false,
          `Item with ID ${itemId}, color ${color}, size ${size}, skuId ${skuId} not found in order details`
        )
      );
    }

    // Check if return is already in progress
    if (
      orderDetail.isReturn ||
      (orderDetail.returnInfo &&
        orderDetail.returnInfo.refundStatus &&
        orderDetail.returnInfo.refundStatus !== "Completed")
    ) {
      await session.commitTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "A return request is already in progress for this item")
      );
    }

    // Check if exchange is already in progress
    if (
      orderDetail.isExchange ||
      (orderDetail.exchangeInfo &&
        orderDetail.exchangeInfo.exchangeStatus &&
        orderDetail.exchangeInfo.exchangeStatus !== "Completed")
    ) {
      await session.commitTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "An exchange request is already in progress for this item")
      );
    }

    // Validate pickup address
    const addressExists = await UserAddress.findOne({
      userId,
      "addressDetail._id": pickupLocationId,
    }).session(session);
    if (!addressExists) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "Pickup address not found"));
    }

    // Fetch item details
    const item = await Item.findById(orderDetail.itemId).session(session);
    if (!item) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(
        apiResponse(404, false, `Item with ID ${orderDetail.itemId} not found`)
      );
    }

    // Fetch item detail for stock check
    const itemDetail = await ItemDetail.findOne({ itemId: orderDetail.itemId }).session(session);
    if (!itemDetail) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json(apiResponse(404, false, "Item details not found"));
    }

    // Validate desiredColor availability for replacement item
    const colorEntry = itemDetail.imagesByColor.find(
      (entry) => entry.color.toLowerCase() === desiredColor.toLowerCase()
    );
    if (!colorEntry) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, `Color ${desiredColor} is not available for this item`)
      );
    }

    // Validate desiredSize availability for replacement item
    const sizeEntry = colorEntry.sizes.find((s) => s.size.toLowerCase() === desiredSize.toLowerCase());
    if (!sizeEntry) {
      // Check if other sizes are available for desiredColor
      const availableSizes = colorEntry.sizes.map((s) => s.size).join(", ");
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(
          400,
          false,
          `Size ${desiredSize} is not available, but different sizes are available for color ${desiredColor}: ${availableSizes}`
        )
      );
    }

    // Check stock availability for replacement item
    if (sizeEntry.stock < orderDetail.quantity) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(
          400,
          false,
          `Requested size ${desiredSize} has insufficient stock for quantity ${orderDetail.quantity}`
        )
      );
    }

    // Validate price consistency
    const originalPrice = item.discountedPrice || item.MRP;
    const newPrice = originalPrice; // Same itemId ensures same price
    if (originalPrice !== newPrice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(
        apiResponse(400, false, "Exchange is only allowed for products with the same price")
      );
    }

    // Prepare exchange info
    const exchangeInfo = {
      exchangeReason,
      exchangeSpecificReason,
      color,
      size,
      skuId,
      desiredColor,
      desiredSize,
      isSizeAvailability: true,
      requestDate: new Date(),
      pickupLocationId,
      exchangeStatus: "Initiated",
    };

    // Update order detail
    orderDetail.isExchange = true;
    orderDetail.exchangeInfo = exchangeInfo;
    order.orderStatus = "Returned";

    // Save order updates
    await order.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Populate order details
    const enrichedOrder = await populateOrderDetails(order, userId);

    // Log success and return response
    log(`Exchange request initiated successfully: ${orderId}`, requestId);
    return res.status(200).json(
      apiResponse(200, true, "Exchange request initiated successfully", {
        order: enrichedOrder,
      })
    );
  } catch (error) {
    // Roll back transaction on error
    await session.abortTransaction();
    session.endSession();
    log(`Error processing return and exchange: ${error.message}`, requestId);
    return res.status(500).json(
      apiResponse(500, false, error.message || "Error while processing return and exchange")
    );
  }
};







// Controller to fetch all orders for a user
exports.fetchAllUserOrders = async (req, res) => {
  // Generate a unique request ID for logging
  const requestId = randomUUID();

  try {
    // Log the start of fetching orders
    log("Fetching user orders", requestId);
    // Extract userId
    const { userId } = req.user;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid userId"));
    }

    // Fetch all orders sorted by creation date
    let orders = await UserOrder.find({ userId }).sort({ createdAt: -1 });

    // Handle no orders found
    if (!orders || orders.length === 0) {
      return res.status(200).json(apiResponse(200, true, "No user orders found", []));
    }

    // Populate order details
    const enrichedOrders = await populateOrderDetails(orders, userId);

    // Log success and return response
    log(`User orders fetched successfully for user: ${userId}`, requestId);
    return res.status(200).json(
      apiResponse(200, true, "User orders fetched successfully", enrichedOrders)
    );
  } catch (error) {
    // Log error and return response
    log(`Error fetching user orders: ${error.message}`, requestId);
    return res.status(500).json(
      apiResponse(500, false, error.message || "Server error while fetching user orders")
    );
  }
};

// Controller to fetch a specific order by orderId
exports.fetchOrderByOrderId = async (req, res) => {
  // Generate a unique request ID for logging
  const requestId = randomUUID();

  try {
    // Log the start of fetching order
    log("Fetching specific order", requestId);
    // Extract userId and orderId
    const { userId } = req.user;
    const { orderId } = req.params;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid userId"));
    }

    // Validate orderId
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      return res.status(400).json(apiResponse(400, false, "Valid orderId is required"));
    }

    // Find order
    let specificOrder = await UserOrder.findOne({ userId, orderId });

    // Handle order not found
    if (!specificOrder) {
      return res.status(404).json(apiResponse(404, false, "Order not found for this user"));
    }

    // Populate order details
    specificOrder = await populateOrderDetails(specificOrder, userId);

    // Log success and return response
    log(`Order fetched successfully: ${orderId}`, requestId);
    return res.status(200).json(
      apiResponse(200, true, "Order fetched successfully", specificOrder)
    );
  } catch (error) {
    // Log error and return response
    log(`Error fetching order: ${error.message}`, requestId);
    return res.status(500).json(
      apiResponse(500, false, error.message || "Error while fetching order")
    );
  }
};
