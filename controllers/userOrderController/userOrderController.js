
const mongoose = require("mongoose");
const UserOrder = require("../../models/User/UserOrder");
const UserCart = require("../../models/User/UserCart");
const UserAddress = require("../../models/User/UserAddress");
const Item = require("../../models/Items/Item");
const ItemDetail = require("../../models/Items/ItemDetail");
const User = require("../../models/User/User");
const { apiResponse } = require("../../utils/apiResponse");
const razorpay = require("../../config/razorpay");
const crypto = require("crypto");

// Function to populate order details
const populateOrderDetails = async (orders, userId) => {
  try {
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid userId");
    }

    // Convert single order to array if not already
    const ordersArray = Array.isArray(orders) ? orders : [orders];

    // Populate user details (name, email, phone, role)
    const populatedOrders = await UserOrder.populate(ordersArray, {
      path: "userId",
      model: User,
      select: "name email phone role",
    });

    // Enrich orders with item details, shipping address, and pickup location
    const enrichedOrders = await Promise.all(
      populatedOrders.map(async (order) => {
        // Populate itemId in orderDetails with name, description, MRP, discountedPrice
        const populatedOrder = await UserOrder.populate(order, {
          path: "orderDetails.itemId",
          model: Item,
          select: "name description MRP discountedPrice",
        });

        // Initialize shippingAddress and pickupLocation
        let shippingAddress = null;
        let pickupLocation = null;

        // Fetch shippingAddressId from UserAddress
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
                (addr) =>
                  addr._id.toString() === order.shippingAddressId.toString()
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

        // Enrich orderDetails with image from ItemDetail based on itemId, color, size, and skuId
        const enrichedOrderDetails = await Promise.all(
          populatedOrder.orderDetails.map(async (detail) => {
            let image = null;

            // Fetch image from ItemDetail
            try {
              const itemDetail = await ItemDetail.findOne({
                itemId: detail.itemId._id,
              });
              if (itemDetail) {
                const colorEntry = itemDetail.imagesByColor.find(
                  (entry) =>
                    entry.color.toLowerCase() === detail.color.toLowerCase()
                );
                if (colorEntry) {
                  const sizeEntry = colorEntry.sizes.find(
                    (s) => s.size === detail.size && s.skuId === detail.skuId
                  );
                  if (sizeEntry && colorEntry.images && colorEntry.images.length > 0) {
                    // Get the image with the highest priority (lowest priority number)
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

            // Fetch pickupLocationId for returnInfo
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
                      addr._id.toString() ===
                      detail.returnInfo.pickupLocationId.toString()
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

            // Fetch pickupLocationId for exchangeInfo
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
                      addr._id.toString() ===
                      detail.exchangeInfo.pickupLocationId.toString()
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

            // Return enriched detail
            return {
              ...detail.toObject(),
              itemId: {
                _id: detail.itemId._id,
                name: detail.itemId.name,
                description: detail.itemId.description,
                MRP: detail.itemId.MRP,
                discountedPrice: detail.itemId.discountedPrice,
                image, // Image from ItemDetail
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

// Create Order Controller (unchanged)
exports.createUserOrder = async (req, res) => {
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

    // Validate required fields
    if (
      !orderDetails ||
      !Array.isArray(orderDetails) ||
      orderDetails.length === 0
    ) {
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

    if (!Array.isArray(invoice) || invoice.length === 0) {
      return res
        .status(400)
        .json(apiResponse(400, "Non-empty invoice array is required", null));
    }

    // Validate invoice entries
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

    // Validate shippingAddressId if provided
    if (shippingAddressId) {
      if (!mongoose.Types.ObjectId.isValid(shippingAddressId)) {
        return res
          .status(400)
          .json(apiResponse(400, "Invalid shippingAddressId", null));
      }
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

    // Validate orderDetails against UserCart
    const userCart = await UserCart.findOne({ userId });
    if (!userCart) {
      return res
        .status(404)
        .json(apiResponse(404, "User cart not found", null));
    }

    for (const orderItem of orderDetails) {
      if (
        !orderItem.itemId ||
        !mongoose.Types.ObjectId.isValid(orderItem.itemId)
      ) {
        return res
          .status(400)
          .json(apiResponse(400, "Valid itemId is required", null));
      }
      if (
        !orderItem.quantity ||
        typeof orderItem.quantity !== "number" ||
        orderItem.quantity < 1
      ) {
        return res
          .status(400)
          .json(
            apiResponse(400, "Valid quantity (minimum 1) is required", null)
          );
      }
      if (
        !orderItem.size ||
        typeof orderItem.size !== "string" ||
        orderItem.size.trim() === ""
      ) {
        return res
          .status(400)
          .json(apiResponse(400, "Valid size is required", null));
      }
      if (
        !orderItem.color ||
        typeof orderItem.color !== "string" ||
        orderItem.color.trim() === ""
      ) {
        return res
          .status(400)
          .json(apiResponse(400, "Valid color is required", null));
      }
      if (
        !orderItem.skuId ||
        typeof orderItem.skuId !== "string" ||
        orderItem.skuId.trim() === ""
      ) {
        return res
          .status(400)
          .json(apiResponse(400, "Valid skuId is required", null));
      }

      // Check if item exists in UserCart
      const cartItem = userCart.items.find(
        (item) =>
          item.itemId.toString() === orderItem.itemId.toString() &&
          item.size === orderItem.size &&
          item.color === orderItem.color &&
          item.skuId === orderItem.skuId
      );
      if (!cartItem) {
        return res
          .status(404)
          .json(
            apiResponse(
              404,
              `Cart item with itemId ${orderItem.itemId}, size ${orderItem.size}, color ${orderItem.color}, skuId ${orderItem.skuId} not found`,
              null
            )
          );
      }
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
      isOrderCancelled: false,
      deliveryDate: null,
    };

    // Handle payment method-specific logic
    if (paymentMethod === "COD") {
      orderData.isOrderPlaced = true;
      orderData.orderStatus = "Confirmed";
      orderData.paymentStatus = "Pending";
    } else if (paymentMethod === "Online") {
      const options = {
        amount: totalAmount * 100, // Convert to paise
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        payment_capture: 1,
      };
      const order = await razorpay.orders.create(options);
      orderData.razorpayOrderId = order.id;
    }

    // Create and save new order
    const newOrder = new UserOrder(orderData);
    const savedOrder = await newOrder.save();

    // Remove cart items that were ordered
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
    await userCart.save();

    return res
      .status(201)
      .json(apiResponse(201, "Order created successfully", savedOrder));
  } catch (error) {
    console.error("Error creating order:", error.message);
    return res
      .status(500)
      .json(
        apiResponse(500, error.message || "Error while creating order", null)
      );
  }
};

// Verify Payment Controller (unchanged)
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res
        .status(400)
        .json(apiResponse(400, "Missing required payment details", null));
    }

    // Verify Razorpay signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json(apiResponse(400, "Invalid signature", null));
    }

    // Update order with payment details
    const userOrder = await UserOrder.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        $set: {
          paymentStatus: "Paid",
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          isOrderPlaced: true,
          orderStatus: "Confirmed",
        },
      },
      { new: true }
    );

    if (!userOrder) {
      return res.status(404).json(apiResponse(404, "Order not found", null));
    }

    return res
      .status(200)
      .json(apiResponse(200, "Payment verified successfully", userOrder));
  } catch (error) {
    console.error("Error verifying payment:", error.message);
    return res
      .status(500)
      .json(apiResponse(500, error.message || "Error verifying payment", null));
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

    // Fetch orders
    let orders = await UserOrder.find({ userId }).sort({ createdAt: -1 });

    if (!orders || orders.length === 0) {
      return res
        .status(200)
        .json(apiResponse(200, "No user orders found", []));
    }

    // Populate order details
    const enrichedOrders = await populateOrderDetails(orders, userId);

    return res
      .status(200)
      .json(apiResponse(200, "User orders fetched successfully", enrichedOrders));
  } catch (error) {
    console.error("Error fetching user orders:", error.message);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          error.message || "Server error while fetching user orders",
          null
        )
      );
  }
};

// Fetch Confirmed User Orders Controller
exports.fetchConfirmedUserOrders = async (req, res) => {
  try {
    const { userId } = req.user;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Fetch orders
    let orders = await UserOrder.find({ userId, orderStatus: "Confirmed" }).sort({
      createdAt: -1,
    });

    // Handle no orders
    if (!orders || orders.length === 0) {
      return res
        .status(200)
        .json(apiResponse(200, "No confirmed orders found", []));
    }

    // Populate order details
    const enrichedOrders = await populateOrderDetails(orders, userId);

    return res
      .status(200)
      .json(
        apiResponse(200, "Confirmed user orders fetched successfully", enrichedOrders)
      );
  } catch (error) {
    console.error("Error fetching confirmed user orders:", error.message);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          error.message || "Server error while fetching confirmed user orders",
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

    // Fetch the specific order
    let specificOrder = await UserOrder.findOne({ userId, orderId });

    // If specific order not found, return 404
    if (!specificOrder) {
      return res
        .status(404)
        .json(apiResponse(404, "Order not found for this user", null));
    }

    // Populate specific order details
    specificOrder = await populateOrderDetails(specificOrder, userId);

    // Fetch all orders and populate
    let allOrders = await UserOrder.find({ userId }).sort({ createdAt: -1 });
    allOrders = await populateOrderDetails(allOrders, userId);

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
    console.error("Error fetching order and user orders:", error.message);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          error.message || "Error while fetching order and user orders",
          null
        )
      );
  }
};

// Cancel Order Controller
exports.cancelOrder = async (req, res) => {
  try {
    const { userId } = req.user;
    const { orderId } = req.body;

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

    // Find the order
    const order = await UserOrder.findOne({ orderId, userId });
    if (!order) {
      return res.status(404).json(apiResponse(404, "Order not found", null));
    }

    // Check if order is already cancelled
    if (order.isOrderCancelled) {
      return res
        .status(400)
        .json(apiResponse(400, "Order is already cancelled", null));
    }

    // Check if order can be cancelled (only before "Dispatched")
    const nonCancellableStatuses = ["Dispatched", "Delivered", "Returned"];
    if (nonCancellableStatuses.includes(order.orderStatus)) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            `Order cannot be cancelled in ${order.orderStatus} status. Cancellation is only allowed before shipping.`,
            null
          )
        );
    }

    // Calculate total refund amount based on item prices
    let totalRefundAmount = 0;
    for (const detail of order.orderDetails) {
      const item = await Item.findById(detail.itemId);
      if (!item) {
        return res
          .status(404)
          .json(
            apiResponse(404, `Item with ID ${detail.itemId} not found`, null)
          );
      }

      const itemPrice = item.discountedPrice || item.MRP;
      const quantity = detail.quantity || 1;
      totalRefundAmount += itemPrice * quantity;
    }

    // Update order status and cancellation flag
    order.orderStatus = "Cancelled";
    order.isOrderCancelled = true;

    // Handle refund logic based on payment method
    if (order.paymentMethod === "COD") {
      // No refund needed for COD as payment hasn't been made
      order.refund = {
        refundReason: "Order cancelled by user (COD)",
        requestDate: new Date(),
      };
    } else if (
      order.paymentMethod === "Online" &&
      order.paymentStatus === "Paid"
    ) {
      // Full refund for online paid orders
      if (!order.razorpayPaymentId) {
        return res
          .status(400)
          .json(apiResponse(400, "No valid Razorpay payment ID found", null));
      }

      try {
        // Process refund with Razorpay
        const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
          amount: totalRefundAmount * 100, // Convert to paise
          speed: "normal",
          notes: {
            reason: "Order cancelled by user (Online)",
            orderId: order.orderId,
          },
        });

        // Set refund object with Razorpay refund transaction ID
        order.refund = {
          refundReason: "Order cancelled by user (Online)",
          requestDate: new Date(),
          refundAmount: totalRefundAmount,
          refundRazorpayTransactionId: refund.id,
          refundStatus: "Processing",
        };
      } catch (razorpayError) {
        console.error("Razorpay refund error:", razorpayError);
        return res
          .status(400)
          .json(
            apiResponse(
              400,
              `Failed to process refund: ${razorpayError.message}`,
              null
            )
          );
      }
    } else {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "Refunds are only applicable for online paid orders or COD",
            null
          )
        );
    }

    await order.save();

    // Populate order details
    const enrichedOrder = await populateOrderDetails(order, userId);

    return res
      .status(200)
      .json(apiResponse(200, "Order cancelled successfully", enrichedOrder));
  } catch (error) {
    console.error("Error cancelling order:", error.message);
    return res
      .status(500)
      .json(
        apiResponse(500, error.message || "Error while cancelling order", null)
      );
  }
};

// Return and Refund Controller
exports.returnRefund = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      orderId,
      itemId,
      returnReason,
      specificReturnReason,
      pickupLocationId,
      bankDetails,
    } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Validate required fields
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      return res
        .status(400)
        .json(apiResponse(400, "Valid orderId is required", null));
    }

    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res
        .status(400)
        .json(apiResponse(400, "Valid itemId is required", null));
    }

    if (
      !pickupLocationId ||
      !mongoose.Types.ObjectId.isValid(pickupLocationId)
    ) {
      return res
        .status(400)
        .json(apiResponse(400, "Valid pickupLocationId is required", null));
    }

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
      return res
        .status(400)
        .json(apiResponse(400, "Valid returnReason is required", null));
    }

    if (
      !specificReturnReason ||
      typeof specificReturnReason !== "string" ||
      specificReturnReason.trim() === ""
    ) {
      return res
        .status(400)
        .json(apiResponse(400, "Valid specificReturnReason is required", null));
    }

    // Validate bankDetails
    if (!bankDetails) {
      return res
        .status(400)
        .json(apiResponse(400, "bankDetails are required", null));
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
      return res
        .status(400)
        .json(
          apiResponse(400, "Complete and valid bankDetails are required", null)
        );
    }

    // Find the order
    const order = await UserOrder.findOne({ orderId, userId });
    if (!order) {
      return res.status(404).json(apiResponse(404, "Order not found", null));
    }

    // Check if order is eligible for return
    if (order.orderStatus !== "Delivered") {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "Order must be in Delivered status to initiate a return",
            null
          )
        );
    }

    // Find the specific order detail
    const orderDetail = order.orderDetails.find(
      (detail) => detail.itemId.toString() === itemId.toString()
    );
    if (!orderDetail) {
      return res
        .status(404)
        .json(apiResponse(404, "Item not found in order details", null));
    }

    // Check if a return or exchange request already exists
    if (
      orderDetail.isReturn ||
      (orderDetail.returnInfo &&
        orderDetail.returnInfo.refundStatus &&
        orderDetail.returnInfo.refundStatus !== "Completed")
    ) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "A return request is already in progress for this item",
            null
          )
        );
    }
    if (
      orderDetail.isExchange ||
      (orderDetail.exchangeInfo &&
        orderDetail.exchangeInfo.exchangeStatus &&
        orderDetail.exchangeInfo.exchangeStatus !== "Completed")
    ) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "An exchange request is already in progress for this item",
            null
          )
        );
    }

    // Validate pickupLocationId
    const addressExists = await UserAddress.findOne({
      userId,
      "addressDetail._id": pickupLocationId,
    });
    if (!addressExists) {
      return res
        .status(404)
        .json(apiResponse(404, "Pickup address not found", null));
    }

    // Calculate refund amount
    const item = await Item.findById(orderDetail.itemId);
    if (!item) {
      return res
        .status(404)
        .json(
          apiResponse(404, `Item with ID ${orderDetail.itemId} not found`, null)
        );
    }

    const itemPrice = item.discountedPrice || item.MRP;
    const quantity = orderDetail.quantity || 1;
    const refundAmountBase = itemPrice * quantity;

    // Initialize return info
    const returnInfo = {
      returnReason,
      specificReturnReason,
      requestDate: new Date(),
      pickupLocationId,
      bankDetails,
      refundStatus: "Initiated",
      refundAmount: 0,
    };

    // Handle refund logic
    if (order.paymentMethod === "COD") {
      const refundAmount = Math.max(0, refundAmountBase - 50);
      returnInfo.refundStatus = "Initiated";
      returnInfo.returnAndRefundTransactionId = `REF-COD-${Date.now()}`; // This could be calculated by the Admin Side
      returnInfo.refundAmount = refundAmount;
    } else if (
      order.paymentMethod === "Online" &&
      order.paymentStatus === "Paid"
    ) {
      if (!order.razorpayPaymentId) {
        return res
          .status(400)
          .json(apiResponse(400, "No valid Razorpay payment ID found", null));
      }

      try {
        const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
          amount: refundAmountBase * 100,
          speed: "normal",
          notes: {
            reason: returnReason,
            specificReason: specificReturnReason,
            orderId: order.orderId,
            itemId,
          },
        });

        returnInfo.returnAndRefundTransactionId = refund.id;
        returnInfo.refundStatus = "Processing";
        returnInfo.refundAmount = refundAmountBase;
      } catch (razorpayError) {
        console.error("Razorpay refund error:", razorpayError);
        return res
          .status(400)
          .json(
            apiResponse(
              400,
              `Failed to process refund: ${razorpayError.message}`,
              null
            )
          );
      }
    } else {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "Refunds are only applicable for online paid orders or COD",
            null
          )
        );
    }

    // Update order detail
    orderDetail.isReturn = true;
    orderDetail.returnInfo = returnInfo;

    // Update order status
    order.orderStatus = "Returned";

    await order.save();

    // Populate order details
    const enrichedOrder = await populateOrderDetails(order, userId);

    return res
      .status(200)
      .json(
        apiResponse(200, "Return and refund request initiated successfully", {
          order: enrichedOrder,
        })
      );
  } catch (error) {
    console.error("Error processing return and refund:", error.message);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          error.message || "Error while processing return and refund",
          null
        )
      );
  }
};

// Return and Exchange Controller
exports.returnAndExchange = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      orderId,
      itemId,
      exchangeReason,
      exchangeSpecificReason,
      pickupLocationId,
      color,
      size,
      skuId,
    } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, "Invalid userId", null));
    }

    // Validate required fields
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      return res
        .status(400)
        .json(apiResponse(400, "Valid orderId is required", null));
    }

    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res
        .status(400)
        .json(apiResponse(400, "Valid itemId is required", null));
    }

    if (
      !pickupLocationId ||
      !mongoose.Types.ObjectId.isValid(pickupLocationId)
    ) {
      return res
        .status(400)
        .json(apiResponse(400, "Valid pickupLocationId is required", null));
    }

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
      return res
        .status(400)
        .json(apiResponse(400, "Valid exchangeReason is required", null));
    }

    if (
      !exchangeSpecificReason ||
      typeof exchangeSpecificReason !== "string" ||
      exchangeSpecificReason.trim() === ""
    ) {
      return res
        .status(400)
        .json(
          apiResponse(400, "Valid exchangeSpecificReason is required", null)
        );
    }

    if (!color || typeof color !== "string" || color.trim() === "") {
      return res
        .status(400)
        .json(apiResponse(400, "Valid color is required", null));
    }

    if (!size || typeof size !== "string" || size.trim() === "") {
      return res
        .status(400)
        .json(apiResponse(400, "Valid size is required", null));
    }

    if (!skuId || typeof skuId !== "string" || skuId.trim() === "") {
      return res
        .status(400)
        .json(apiResponse(400, "Valid skuId is required", null));
    }

    // Find the order
    const order = await UserOrder.findOne({ orderId, userId });
    if (!order) {
      return res.status(404).json(apiResponse(404, "Order not found", null));
    }

    // Check if order is eligible for exchange
    if (order.orderStatus !== "Delivered") {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "Order must be in Delivered status to initiate an exchange",
            null
          )
        );
    }

    // Find the specific order detail
    const orderDetail = order.orderDetails.find(
      (detail) => detail.itemId.toString() === itemId.toString()
    );
    if (!orderDetail) {
      return res
        .status(404)
        .json(apiResponse(404, "Item not found in order details", null));
    }

    // Check if a return or exchange request already exists
    if (
      orderDetail.isReturn ||
      (orderDetail.returnInfo &&
        orderDetail.returnInfo.refundStatus &&
        orderDetail.returnInfo.refundStatus !== "Completed")
    ) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "A return request is already in progress for this item",
            null
          )
        );
    }
    if (
      orderDetail.isExchange ||
      (orderDetail.exchangeInfo &&
        orderDetail.exchangeInfo.exchangeStatus &&
        orderDetail.exchangeInfo.exchangeStatus !== "Completed")
    ) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "An exchange request is already in progress for this item",
            null
          )
        );
    }

    // Validate pickupLocationId
    const addressExists = await UserAddress.findOne({
      userId,
      "addressDetail._id": pickupLocationId,
    });
    if (!addressExists) {
      return res
        .status(404)
        .json(apiResponse(404, "Pickup address not found", null));
    }

    // Validate the requested product variant
    const item = await Item.findById(orderDetail.itemId);
    if (!item) {
      return res
        .status(404)
        .json(
          apiResponse(404, `Item with ID ${orderDetail.itemId} not found`, null)
        );
    }

    const itemDetail = await ItemDetail.findOne({ itemId: orderDetail.itemId });
    if (!itemDetail) {
      return res
        .status(404)
        .json(apiResponse(404, "Item details not found", null));
    }

    // Validate color, size, and skuId
    const colorEntry = itemDetail.imagesByColor.find(
      (entry) => entry.color.toLowerCase() === color.toLowerCase()
    );
    if (!colorEntry) {
      return res
        .status(400)
        .json(
          apiResponse(400, `Color ${color} not available for this item`, null)
        );
    }

    const sizeEntry = colorEntry.sizes.find(
      (s) => s.size === size && s.skuId === skuId
    );
    if (!sizeEntry) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            `Size ${size} or skuId ${skuId} not available for color ${color}`,
            null
          )
        );
    }

    // Check stock availability
    if (sizeEntry.stock <= 0) {
      return res
        .status(400)
        .json(apiResponse(400, `Requested size ${size} is out of stock`, null));
    }

    // Validate price
    const originalPrice = item.discountedPrice || item.MRP;
    const newPrice = originalPrice;
    if (originalPrice !== newPrice) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "Exchange is only allowed for products with the same price",
            null
          )
        );
    }

    // Initialize exchange info
    const exchangeInfo = {
      exchangeReason,
      exchangeSpecificReason,
      color,
      size,
      skuId,
      isSizeAvailability: true,
      requestDate: new Date(),
      pickupLocationId,
      exchangeStatus: "Initiated",
    };

    // Update order detail
    orderDetail.isExchange = true;
    orderDetail.exchangeInfo = exchangeInfo;

    // Update order status
    order.orderStatus = "Returned";

    await order.save();

    // Populate order details
    const enrichedOrder = await populateOrderDetails(order, userId);

    return res
      .status(200)
      .json(
        apiResponse(200, "Exchange request initiated successfully", {
          order: enrichedOrder,
        })
      );
  } catch (error) {
    console.error("Error processing return and exchange:", error.message);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          error.message || "Error while processing return and exchange",
          null
        )
      );
  }
};