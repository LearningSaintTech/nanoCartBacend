const mongoose = require("mongoose");
const PartnerOrder = require("../../models/Partner/PartnerOrder"); // Adjust path to PartnerOrder model
const ItemDetail = require("../../models/Items/ItemDetail");
const PartnerAddress = require("../../models/Partner/PartnerAddress"); // Adjust path to PartnerAddress model
const { apiResponse } = require("../../utils/apiResponse");

// Utility to populate order fields
const populateOrder = (query) =>
  query
    .populate("partnerId", "name email") // Changed from userId to partnerId
    .populate("orderDetails.itemId", "name price")
    .populate("cancelStatus.itemId", "name price")
    .populate("refund.itemId", "name price")
    .populate("returnAndRefund.itemId", "name price")
    .populate("exchange.itemId", "name price")
    .populate("shippingAddressId", "address city state country postalCode") // References PartnerAddress
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
    const { partnerId } = req.user; // Changed from userId to partnerId
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

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res
        .status(400)
        .json(apiResponse(400, "Invalid partnerId", null));
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
      const itemDetail = await ItemDetail.findOne({ _id: item.itemId }); // Changed from itemId to _id
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
      // Check if shippingAddressId exists in PartnerAddress
      const addressExists = await PartnerAddress.findOne({
        partnerId,
        _id: shippingAddressId, // Assuming PartnerAddress has _id field
      });
      if (!addressExists) {
        return res
          .status(404)
          .json(apiResponse(404, "Shipping address not found", null));
      }
    }

    // Validate payment method
    if (!paymentMethod || !["Online", "COD", "Wallet"].includes(paymentMethod)) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            "Valid payment method (Online, COD, or Wallet) is required",
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
      partnerId, // Changed from userId to partnerId
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
    } else if (paymentMethod === " Waller") {
      // Assuming Wallet payment is similar to Online but without Razorpay
      orderData.paymentStatus = "Paid";
      orderData.isOrderPlaced = true;
      orderData.orderStatus = "Confirmed";
    }

    // Create new order
    const newOrder = new PartnerOrder(orderData);

    // Save the order
    const savedOrder = await newOrder.save();

    // Populate referenced fields for response
    const populatedOrder = await populateOrder(
      PartnerOrder.findById(savedOrder._id)
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

// Fetch All Partner Orders Controller
exports.fetchPartnerOrders = async (req, res) => {
  try {
    const { partnerId } = req.user; // Changed from userId to partnerId
    const { page = 1, limit = 10 } = req.query;

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res
        .status(400)
        .json(apiResponse(400, "Invalid partnerId", null));
    }

    // Validate pagination parameters
    const pageNum = Number(page);
    const limitNum = Number(limit);
    if (pageNum < 1 || limitNum < 1) {
      return res
        .status(400)
        .json(
          apiResponse(400, "Page and limit must be positive numbers", null)
        );
    }

    // Fetch orders and populate referenced fields
    const orders = await populateOrder(
      PartnerOrder.find({ partnerId }) // Changed from UserOrder to PartnerOrder
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
    );

    const total = await PartnerOrder.countDocuments({ partnerId });

    // Prepare response data
    const responseData = {
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };

    return res
      .status(200)
      .json(
        apiResponse(200, "Partner orders fetched successfully", responseData)
      );
  } catch (error) {
    console.error("Error fetching partner orders:", error.message);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          error.message || "Server error while fetching partner orders",
          null
        )
      );
  }
};

// Fetch Confirmed Partner Orders Controller
exports.fetchConfirmedPartnerOrders = async (req, res) => {
  try {
    // Check if partner info exists
    if (!req.user || !req.user.partnerId) {
      return res.status(401).json(apiResponse(401, "Unauthorized", null));
    }

    const { partnerId } = req.user; // Changed from userId to partnerId
    const { page = 1, limit = 10 } = req.query;

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res
        .status(400)
        .json(apiResponse(400, "Invalid partnerId", null));
    }

    // Fetch orders with orderStatus: "Confirmed"
    const orders = await PartnerOrder.find({
      partnerId,
      orderStatus: "Confirmed",
    }) // Changed from UserOrder to PartnerOrder
      .populate("orderDetails.itemId", "name description")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await PartnerOrder.countDocuments({
      partnerId,
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
      apiResponse(200, "Confirmed partner orders fetched successfully", {
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
    console.error("Error fetching confirmed partner orders:", error);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          "Server error while fetching confirmed partner orders",
          null
        )
      );
  }
};

// Fetch Specific Order and All Partner Orders Controller
exports.fetchOrderByOrderId = async (req, res) => {
  try {
    const { partnerId } = req.user; // Changed from userId to partnerId
    const { orderId } = req.params;

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res
        .status(400)
        .json(apiResponse(400, "Invalid partnerId", null));
    }

    // Validate orderId
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
      return res
        .status(400)
        .json(apiResponse(400, "Valid orderId is required", null));
    }

    // Fetch the specific order by partnerId and orderId
    const specificOrder = await populateOrder(
      PartnerOrder.findOne({ partnerId, orderId }) // Changed from UserOrder to PartnerOrder
    );

    // If specific order not found, return 404
    if (!specificOrder) {
      return res
        .status(404)
        .json(apiResponse(404, "Order not found for this partner", null));
    }

    // Fetch all orders for the partner
    const allOrders = await populateOrder(
      PartnerOrder.find({ partnerId }).sort({ createdAt: -1 })
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
          "Order and partner orders fetched successfully",
          responseData
        )
      );
  } catch (error) {
    console.error("Error fetching order and partner orders:", error);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          "Server error while fetching order and partner orders",
          null
        )
      );
  }
};