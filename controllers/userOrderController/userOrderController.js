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
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
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

// Fetch All User Orders Controller

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


// // Cancel Orders Controller
// exports.cancelOrders = async (req, res) => {
//   try {
//     const { userId } = req.user;
//     const { orderId, reason, bankDetails, itemsId } = req.body;

//     // Validate userId
//     if (!mongoose.Types.ObjectId.isValid(userId)) {
//       return res.status(400).json(apiResponse(400, "Invalid userId", null));
//     }

//     // Validate reason
//     if (!reason || typeof reason !== "string" || reason.trim() === "") {
//       return res
//         .status(400)
//         .json(apiResponse(400, "Reason for cancellation is required", null));
//     }

//     // Validate itemsId
//     let itemsToCancel = null;
//     if (itemsId) {
//       if (!Array.isArray(itemsId) || itemsId.length === 0) {
//         return res
//           .status(400)
//           .json(
//             apiResponse(400, "itemsId must be a non-empty array or null", null)
//           );
//       }
//       for (const itemId of itemsId) {
//         if (!mongoose.Types.ObjectId.isValid(itemId)) {
//           return res
//             .status(400)
//             .json(apiResponse(400, `Invalid itemId: ${itemId}`, null));
//         }
//       }
//       itemsToCancel = itemsId.map((id) => new mongoose.Types.ObjectId(id));
//     }

//     const results = [];
//     const errors = [];

//     // Find the order
//     const order = await UserOrder.findOne({ userId, orderId });
//     if (!order) {
//       return res
//         .status(404)
//         .json(apiResponse(404, "Order not found for this user", null));
//     }

//     // Check if order is in a cancellable state
//     const cancellableStatuses = [
//       "Initiated",
//       "Confirmed",
//       "Ready for Dispatch",
//       "Dispatched",
//     ];
//     if (!cancellableStatuses.includes(order.orderStatus)) {
//       return res
//         .status(400)
//         .json(
//           apiResponse(
//             400,
//             `Order cannot be cancelled. Current status: ${order.orderStatus}`,
//             null
//           )
//         );
//     }

//     // Validate bankDetails based on paymentMethod
//     if (order.paymentMethod === "COD") {
//       if (!bankDetails || typeof bankDetails !== "object") {
//         return res
//           .status(400)
//           .json(
//             apiResponse(400, "Bank details are required for COD orders", null)
//           );
//       }
//       const { accountNumber, ifscCode, branchName, accountName } = bankDetails;
//       if (
//         !accountNumber ||
//         typeof accountNumber !== "string" ||
//         accountNumber.trim() === "" ||
//         !ifscCode ||
//         typeof ifscCode !== "string" ||
//         ifscCode.trim() === "" ||
//         !branchName ||
//         typeof branchName !== "string" ||
//         branchName.trim() === "" ||
//         !accountName ||
//         typeof accountName !== "string" ||
//         accountName.trim() === ""
//       ) {
//         return res
//           .status(400)
//           .json(
//             apiResponse(
//               400,
//               "All bank details (accountNumber, ifscCode, branchName, accountName) must be non-empty strings for COD orders",
//               null
//             )
//           );
//       }
//     } else if (order.paymentMethod === "Online") {
//       if (bankDetails !== null) {
//         return res
//           .status(400)
//           .json(
//             apiResponse(
//               400,
//               "Bank details must be null for Online payment orders",
//               null
//             )
//           );
//       }
//     } else {
//       return res
//         .status(400)
//         .json(apiResponse(400, "Invalid paymentMethod", null));
//     }

//     // Validate itemsId against orderDetails
//     const itemsToProcess = [];
//     if (itemsToCancel) {
//       for (const itemId of itemsToCancel) {
//         const item = order.orderDetails.find((detail) =>
//           detail.itemId.equals(itemId)
//         );
//         if (!item) {
//           errors.push({
//             orderId,
//             message: `ItemId ${itemId} not found in order`,
//           });
//           continue;
//         }
//         if (item.isItemCancel) {
//           errors.push({
//             orderId,
//             message: `ItemId ${itemId} is already canceled`,
//           });
//           continue;
//         }
//         itemsToProcess.push(item);
//       }
//     } else {
//       for (const item of order.orderDetails) {
//         if (item.isItemCancel) {
//           errors.push({
//             orderId,
//             message: `ItemId ${item.itemId} is already canceled`,
//           });
//           continue;
//         }
//         itemsToProcess.push(item);
//       }
//     }

//     if (itemsToProcess.length === 0) {
//       return res
//         .status(400)
//         .json(apiResponse(400, "No valid items to cancel", { errors }));
//     }

//     // Calculate base amounts
//     if (typeof order.totalAmount !== "number" || order.totalAmount < 0) {
//       return res
//         .status(400)
//         .json(apiResponse(400, "Invalid or missing totalAmount", null));
//     }
//     const shippingInvoice = order.invoice.find(
//       (entry) => entry.key.trim().toLowerCase() === "shippingcharge"
//     );
//     const shippingCharge =
//       shippingInvoice &&
//       shippingInvoice.value !== "0" &&
//       shippingInvoice.value.toLowerCase() !== "free"
//         ? parseFloat(shippingInvoice.value || 0)
//         : 0;
//     if (isNaN(shippingCharge)) {
//       return res
//         .status(400)
//         .json(apiResponse(400, "Invalid shipping charge in invoice", null));
//     }
//     const gstInvoice = order.invoice.find(
//       (entry) => entry.key.trim().toLowerCase() === "gst"
//     );
//     const gst = gstInvoice ? parseFloat(gstInvoice.value || 0) : 0;
//     if (isNaN(gst)) {
//       return res
//         .status(400)
//         .json(apiResponse(400, "Invalid GST in invoice", null));
//     }

//     // Update order details and refund
//     const isAllItems = itemsToProcess.length === order.orderDetails.length;
//     let totalRefundAmount = 0;

//     for (const item of itemsToProcess) {
//       // Calculate refund amount
//       let refundAmount;
//       if (isAllItems) {
//         refundAmount =
//           (order.totalAmount - (gst + shippingCharge)) /
//           order.orderDetails.length;
//       } else {
//         refundAmount =
//           order.totalAmount / order.orderDetails.length -
//           (gst + shippingCharge);
//       }
//       refundAmount = Math.max(0, refundAmount);

//       // Update orderDetails
//       item.isItemCancel = true;

//       // Add to refund array
//       const refundEntry = {
//         itemId: item.itemId,
//         refundReason: reason.trim(),
//         requestDate: new Date(),
//         refundAmount,
//         refundStatus: "Initiated",
//         bankDetails:
//           order.paymentMethod === "COD"
//             ? {
//                 accountNumber: bankDetails.accountNumber.trim(),
//                 ifscCode: bankDetails.ifscCode.trim(),
//                 branchName: bankDetails.branchName.trim(),
//                 accountName: bankDetails.accountName.trim(),
//               }
//             : null,
//       };
//       order.refund.push(refundEntry);
//       totalRefundAmount += refundAmount;

//       // Restore stock in ItemDetail
//       const itemDetail = await ItemDetail.findOne({ itemId: item.itemId });
//       if (!itemDetail) {
//         errors.push({
//           orderId,
//           message: `ItemDetail not found for itemId: ${item.itemId}`,
//         });
//         continue;
//       }

//       const colorEntry = itemDetail.imagesByColor.find(
//         (entry) => entry.color === item.color
//       );
//       if (!colorEntry) {
//         errors.push({
//           orderId,
//           message: `Color ${item.color} not found for itemId: ${item.itemId}`,
//         });
//         continue;
//       }

//       const sizeEntry = colorEntry.sizes.find(
//         (size) => size.size === item.size && size.skuId === item.skuId
//       );
//       if (!sizeEntry) {
//         errors.push({
//           orderId,
//           message: `Size ${item.size} or skuId ${item.skuId} not found for color ${item.color}`,
//         });
//         continue;
//       }

//       sizeEntry.stock += item.quantity;
//       await itemDetail.save();
//     }

//     // Update order status
//     if (isAllItems) {
//       order.isOrderCancelled = true;
//       order.orderStatus = "Cancelled";
//     }

//     // Save the updated order
//     await order.save();

//     // Populate referenced fields for response
//     const populatedOrder = await populateOrder(UserOrder.findById(order._id));

//     results.push({ orderId, order: populatedOrder });

//     // Prepare response
//     if (errors.length > 0 && results.length === 0) {
//       return res
//         .status(400)
//         .json(apiResponse(400, "Order failed to cancel", { errors }));
//     }

//     const response = {
//       results,
//       errors: errors.length > 0 ? errors : undefined,
//     };

//     return res
//       .status(200)
//       .json(apiResponse(200, "Order cancellation processed", response));
//   } catch (error) {
//     console.error("Error cancelling order:", error.message);
//     return res
//       .status(400)
//       .json(
//         apiResponse(400, error.message || "Error while cancelling order", null)
//       );
//   }
// };

// // Exchange/Return Orders Controller
// exports.exchangeOrders = async (req, res) => {};
