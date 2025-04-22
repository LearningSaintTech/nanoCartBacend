const mongoose = require("mongoose");
const PartnerOrder = require("../../models/Partner/PartnerOrder");
const ItemDetail = require("../../models/Items/ItemDetail");
const { apiResponse } = require("../../utils/apiResponse");

// Create Order Controller
exports.createOrder = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const {
      itemDescription,
      invoiceId,
      totalPrice,
      shippingAddressId,
      walletId,
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
    if (!itemDescription || !invoiceId || !totalPrice) {
      return res.status(400).json(apiResponse(400, "ItemDescription, invoiceId, and totalPrice are required", null));
    }

    // Validate invoiceId
    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json(apiResponse(400, "Invalid invoiceId", null));
    }

    // Validate itemDescription array
    if (!Array.isArray(itemDescription) || itemDescription.length === 0) {
      return res.status(400).json(apiResponse(400, "ItemDescription must be a non-empty array", null));
    }

    // Validate each item
    for (const item of itemDescription) {
      if (!item.itemId || !mongoose.Types.ObjectId.isValid(item.itemId)) {
        return res.status(400).json(apiResponse(400, "Each item must have a valid itemId", null));
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

      if (sizeEntry.stock <= 0) {
        return res.status(400).json(apiResponse(400, `Out of stock for itemId: ${item.itemId}, size: ${item.size}`, null));
      }
    }

    // Validate shippingAddressId if provided
    if (shippingAddressId && !mongoose.Types.ObjectId.isValid(shippingAddressId)) {
      return res.status(400).json(apiResponse(400, "Invalid shippingAddressId", null));
    }

    // Validate payment method
    if (!paymentMethod || !["Online", "COD", "Wallet"].includes(paymentMethod)) {
      return res.status(400).json(apiResponse(400, "Payment method must be Online, COD or Wallet", null));
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
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hrs
    };

    // Payment method-specific handling
    if (paymentMethod === "COD") {
      orderData.isOrderPlaced = true;
      orderData.orderStatus = "Confirmed";
      orderData.paymentStatus = "Pending";
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
    }

    // Create and save the order
    const newOrder = new PartnerOrder(orderData);
    const savedOrder = await newOrder.save();

    // Populate referenced fields
    const populatedOrder = await PartnerOrder.findById(savedOrder._id)
      .populate("partnerId", "name email")
      .populate("itemDescription.itemId", "name price")
      .populate("invoiceId", "couponDiscount GST shippingCharge")
      .populate("shippingAddressId", "address city state country postalCode");

    return res.status(201).json(apiResponse(201, "Order created successfully", { order: populatedOrder }));
  } catch (error) {
    console.error("Error creating order:", error.message);
    return res.status(500).json(apiResponse(500, "Server error while creating order", null));
  }
};


// Fetch All User Orders Controller
exports.fetchUserOrders = async (req, res) => {
  try {
    const { partnerId } = req.user;

    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, "Invalid partnerId", null));
    }

    const orders = await PartnerOrder.find({ partnerId })
      .populate("itemDescription.itemId", "name description")
      .sort({ createdAt: -1 });

    return res.status(200).json(apiResponse(200, "User orders fetched successfully", { orders }));
  } catch (error) {
    console.error("Error fetching user orders:", error);
    return res.status(500).json(apiResponse(500, "Server error while fetching user orders", null));
  }
};
// exports.fetchConfirmedUserOrders = async (req, res) => {
//   try {
//     const { partnerId } = req.user;

//     // Validate partnerId
//     if (!mongoose.Types.ObjectId.isValid(partnerId)) {
//       return res.status(400).json(apiResponse(400, "Invalid partnerId", null));
//     }

//     // Fetch orders with orderStatus: "Confirmed" and populate referenced fields
//     const orders = await UserOrder.find({ partnerId, orderStatus: "Confirmed" })
//       .populate("itemDescription.itemId", "name description")
//       .sort({ createdAt: -1 }); // Sort by newest first

//     // Prepare response data
//     const responseData = { orders };

//     return res
//       .status(200)
//       .json(
//         apiResponse(
//           200,
//           "Confirmed user orders fetched successfully",
//           responseData
//         )
//       );
//   } catch (error) {
//     console.error("Error fetching confirmed user orders:", error);
//     return res
//       .status(500)
//       .json(
//         apiResponse(
//           500,
//           "Server error while fetching confirmed user orders",
//           null
//         )
//       );
//   }
// };

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

    const specificOrder = await PartnerOrder.findOne({ partnerId, orderId })
      .populate("partnerId", "name email")
      .populate("itemDescription.itemId", "name price")
      .populate("shippingAddressId", "address city state country postalCode")
      .populate("invoiceId", "couponDiscount GST shippingCharge");

    if (!specificOrder) {
      return res.status(404).json(apiResponse(404, "Order not found for this user", null));
    }

    const allOrders = await PartnerOrder.find({ partnerId })
      .populate("partnerId", "name email")
      .populate("itemDescription.itemId", "name price")
      .populate("shippingAddressId", "address city state country postalCode")
      .populate("invoiceId", "couponDiscount GST shippingCharge")
      .sort({ createdAt: -1 });

    return res.status(200).json(apiResponse(200, "Order and user orders fetched successfully", {
      specificOrder,
      allOrders,
    }));
  } catch (error) {
    console.error("Error fetching order and user orders:", error);
    return res.status(500).json(apiResponse(500, "Server error while fetching order and user orders", null));
  }
};
// // Cancel Order Controller
// exports.cancelOrder = async (req, res) => {
//   try {
//     const { partnerId } = req.user;
//     const { orderId } = req.params;
//     const { reason, bankDetails } = req.body;

//     // Validate partnerId
//     if (!mongoose.Types.ObjectId.isValid(partnerId)) {
//       return res.status(400).json(apiResponse(400, "Invalid partnerId", null));
//     }

//     // Validate orderId
//     if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
//       return res
//         .status(400)
//         .json(apiResponse(400, "Valid orderId is required", null));
//     }

//     // Validate reason
//     if (!reason || typeof reason !== "string" || reason.trim() === "") {
//       return res
//         .status(400)
//         .json(apiResponse(400, "Reason for cancellation is required", null));
//     }

//     // Validate bankDetails
//     if (!bankDetails || typeof bankDetails !== "object") {
//       return res
//         .status(400)
//         .json(apiResponse(400, "Bank details are required", null));
//     }

//     const { accountNumber, ifscCode, branchName, accountName } = bankDetails;
//     if (
//       !accountNumber ||
//       typeof accountNumber !== "string" ||
//       accountNumber.trim() === "" ||
//       !ifscCode ||
//       typeof ifscCode !== "string" ||
//       ifscCode.trim() === "" ||
//       !branchName ||
//       typeof branchName !== "string" ||
//       branchName.trim() === "" ||
//       !accountName ||
//       typeof accountName !== "string" ||
//       accountName.trim() === ""
//     ) {
//       return res
//         .status(400)
//         .json(
//           apiResponse(
//             400,
//             "All bank details (accountNumber, ifscCode, branchName, accountName) must be non-empty strings",
//             null
//           )
//         );
//     }

//     // Find the order
//     const order = await UserOrder.findOne({ partnerId, orderId });
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

//     // Update order status to Cancelled
//     order.orderStatus = "Cancelled";

//     // Update refund and bank details for all orders
//     order.refund.isRefundActive = true;
//     order.refund.status = "Initiated";
//     order.refund.requestDate = new Date();
//     order.refund.amount = order.totalPrice;
//     order.refund.reason = reason.trim();
//     order.BankDetails = {
//       accountNumber: accountNumber.trim(),
//       ifscCode: ifscCode.trim(),
//       branchName: branchName.trim(),
//       accountName: accountName.trim(),
//     };

//     // Restore stock in ItemDetail
//     for (const item of order.itemDescription) {
//       const itemDetail = await ItemDetail.findOne({ itemId: item.itemId });
//       if (!itemDetail) {
//         return res
//           .status(404)
//           .json(
//             apiResponse(
//               404,
//               `ItemDetail not found for itemId: ${item.itemId}`,
//               null
//             )
//           );
//       }

//       const colorEntry = itemDetail.imagesByColor.find(
//         (entry) => entry.color === item.color
//       );
//       if (!colorEntry) {
//         return res
//           .status(400)
//           .json(
//             apiResponse(
//               400,
//               `Color ${item.color} not found for itemId: ${item.itemId}`,
//               null
//             )
//           );
//       }

//       const sizeEntry = colorEntry.sizes.find(
//         (size) => size.size === item.size && size.skuId === item.skuId
//       );
//       if (!sizeEntry) {
//         return res
//           .status(400)
//           .json(
//             apiResponse(
//               400,
//               `Size ${item.size} or skuId ${item.skuId} not found for color ${item.color}`,
//               null
//             )
//           );
//       }

//       // Increment stock (assuming 1 unit per item in order)
//       sizeEntry.stock += 1;
//       await itemDetail.save();
//     }

//     // Save the updated order
//     await order.save();

//     // Populate referenced fields for response
//     const populatedOrder = await UserOrder.findById(order._id)
//       .populate("partnerId", "name email")
//       .populate("itemDescription.itemId", "name price")
//       .populate("shippingAddressId", "address city state country postalCode")
//       .populate("invoiceId", "couponDiscount GST shippingCharge");

//     return res.status(200).json(
//       apiResponse(200, "Order cancelled successfully", {
//         order: populatedOrder,
//       })
//     );
//   } catch (error) {
//     console.error("Error cancelling order:", error.message);
//     return res
//       .status(500)
//       .json(apiResponse(500, "Server error while cancelling order", null));
//   }
// };
