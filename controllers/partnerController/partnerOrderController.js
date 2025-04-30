const mongoose = require("mongoose");
const PartnerOrder = require("../models/PartnerOrder");
const PartnerCart = require("../models/PartnerCart");
const Wallet = require("../models/Wallet");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const PartnerAddress = require("../models/PartnerAddress");

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Partner Order Controller
exports.createPartnerOrder = async (req, res) => {
  try {
    const {
      walletAmountUsed = 0,
      orderDetails,
      invoice,
      shippingAddressId,
      paymentMethod,
      totalAmount,
      isWalletAmountUsed = false,
    } = req.body;
    const { partnerId } = req.user;

    // Validate required fields
    if (!orderDetails || !Array.isArray(orderDetails) || orderDetails.length === 0) {
      return res.status(400).json({ success: false, message: "Order details are required and must be a non-empty array" });
    }
    if (!invoice || !Array.isArray(invoice) || invoice.length === 0) {
      return res.status(400).json({ success: false, message: "Invoice details are required and must be a non-empty array" });
    }
    if (!shippingAddressId) {
      return res.status(400).json({ success: false, message: "Shipping address is required" });
    }
    if (!paymentMethod || !["Online", "COD"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Valid payment method (Online or COD) is required" });
    }

    // Validate isWalletAmountUsed and walletAmountUsed consistency
    if (isWalletAmountUsed && walletAmountUsed <= 0) {
      return res.status(400).json({ success: false, message: "walletAmountUsed must be positive when isWalletAmountUsed is true" });
    }
    if (!isWalletAmountUsed && walletAmountUsed > 0) {
      return res.status(400).json({ success: false, message: "isWalletAmountUsed must be true when walletAmountUsed is provided" });
    }

    // Validate invoice array entries
    for (const entry of invoice) {
      if (
        !entry.key ||
        typeof entry.key !== "string" ||
        entry.key.trim() === ""
      ) {
        return res.status(400).json({ success: false, message: "Each invoice entry must have a valid key" });
      }
      if (
        entry.value === undefined ||
        entry.value === null ||
        entry.value.toString().trim() === ""
      ) {
        return res.status(400).json({ success: false, message: "Each invoice entry must have a valid value" });
      }
    }

    // Validate totalAmount
    if (typeof totalAmount !== "number" || totalAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid totalAmount is required and must be positive" });
    }

    // Validate orderDetails cartItemIds against PartnerCart
    const cart = await PartnerCart.findOne({ partnerId }).populate("items.itemId");
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(404).json({ success: false, message: "No cart found for this partner" });
    }

    for (const item of orderDetails) {
      if (!item.cartItemId || !mongoose.Types.ObjectId.isValid(item.cartItemId)) {
        return res.status(400).json({ success: false, message: "Invalid cartItemId in order details" });
      }

      // Check if cartItemId exists in the partner's cart items
      const cartItem = cart.items.find(
        (cartItem) => cartItem._id.toString() === item.cartItemId.toString()
      );
      if (!cartItem) {
        return res.status(404).json({ success: false, message: `Cart item ${item.cartItemId} not found in partner's cart` });
      }

      // Additional validation for cart item properties
      if (!cartItem.itemId || !mongoose.Types.ObjectId.isValid(cartItem.itemId)) {
        return res.status(400).json({ success: false, message: `Invalid itemId for cart item ${item.cartItemId}` });
      }
      if (cartItem.totalQuantity < 1) {
        return res.status(400).json({ success: false, message: `Invalid totalQuantity for cart item ${item.cartItemId}` });
      }
      if (cartItem.totalPrice < 1) {
        return res.status(400).json({ success: false, message: `Invalid totalPrice for cart item ${item.cartItemId}` });
      }
      if (!cartItem.orderDetails || !Array.isArray(cartItem.orderDetails) || cartItem.orderDetails.length === 0) {
        return res.status(400).json({ success: false, message: `Order details missing for cart item ${item.cartItemId}` });
      }
      for (const detail of cartItem.orderDetails) {
        if (detail.sizeAndQuantity && Array.isArray(detail.sizeAndQuantity)) {
          for (const sizeQty of detail.sizeAndQuantity) {
            if (!sizeQty.skuId || typeof sizeQty.skuId !== "string" || sizeQty.skuId.trim() === "") {
              return res.status(400).json({ success: false, message: `Invalid skuId for cart item ${item.cartItemId}` });
            }
            if (sizeQty.quantity < 1) {
              return res.status(400).json({ success: false, message: `Invalid quantity for cart item ${item.cartItemId}` });
            }
          }
        }
      }
    }

    // Validate shipping address
    const shippingAddress = await PartnerAddress.findOne({
      _id: shippingAddressId,
      partnerId,
    });
    if (!shippingAddress) {
      return res.status(404).json({ success: false, message: "Shipping address not found or does not belong to partner" });
    }

    // Generate unique orderId
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Base order object
    const orderData = {
      orderId,
      partnerId,
      orderDetails,
      invoice,
      shippingAddressId,
      paymentMethod,
      totalAmount,
      walletAmountUsed,
      isOrderPlaced: true,
    };

    // Handle different payment scenarios
    if (paymentMethod === "COD" && isWalletAmountUsed) {
      // Case 1: Wallet + COD
      orderData.paymentStatus = "Pending";
      const order = await PartnerOrder.create(orderData);

      // Call deductFunds for wallet amount
      await deductFunds({
        body: {
          partnerId,
          amount: walletAmountUsed,
          orderId,
          description: `Wallet payment for order ${orderId}`,
        },
        user: { partnerId },
      });

      return res.status(201).json({
        success: true,
        message: "Order created successfully with Wallet + COD",
        order,
      });

    } else if (paymentMethod === "Online" && isWalletAmountUsed) {
      // Case 2: Wallet + Online
      const amountToPayOnline = totalAmount - walletAmountUsed;
      if (amountToPayOnline <= 0) {
        return res.status(400).json({ success: false, message: "Online payment amount must be greater than 0" });
      }

      // Create Razorpay order
      const razorpayOrder = await razorpay.orders.create({
        amount: amountToPayOnline * 100, // Convert to paise
        currency: "INR",
        receipt: orderId,
      });

      orderData.razorpayOrderId = razorpayOrder.id;
      orderData.paymentStatus = "Pending";
      const order = await PartnerOrder.create(orderData);

      return res.status(201).json({
        success: true,
        message: "Order created successfully with Wallet + Online",
        order,
        razorpayOrder: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
        },
      });

    } else if (paymentMethod === "COD") {
      // Case 3: Only COD
      if (isWalletAmountUsed) {
        return res.status(400).json({ success: false, message: "Wallet cannot be used with Only COD payment" });
      }
      orderData.paymentStatus = "Pending";
      const order = await PartnerOrder.create(orderData);

      return res.status(201).json({
        success: true,
        message: "Order created successfully with COD",
        order,
      });

    } else if (paymentMethod === "Online") {
      // Case 4: Only Online
      if (isWalletAmountUsed) {
        return res.status(400).json({ success: false, message: "Wallet cannot be used with Only Online payment" });
      }
      const razorpayOrder = await razorpay.orders.create({
        amount: totalAmount * 100, // Convert to paise
        currency: "INR",
        receipt: orderId,
      });

      orderData.razorpayOrderId = razorpayOrder.id;
      orderData.paymentStatus = "Pending";
      const order = await PartnerOrder.create(orderData);

      return res.status(201).json({
        success: true,
        message: "Order created successfully with Online payment",
        order,
        razorpayOrder: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
        },
      });
    }

  } catch (error) {
    console.error("Error creating partner order:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Verify Online Payment Controller
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;
    const { partnerId } = req.user;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({ success: false, message: "All payment details are required" });
    }

    // Find the order
    const order = await PartnerOrder.findOne({ orderId, partnerId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    // Update order with payment details
    order.razorpayOrderId = razorpay_order_id;
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.paymentStatus = "Paid";

    // If wallet amount was used, deduct funds
    if (order.walletAmountUsed > 0) {
      await deductFunds({
        body: {
          partnerId,
          amount: order.walletAmountUsed,
          orderId,
          description: `Wallet payment for order ${orderId}`,
        },
        user: { partnerId },
      });
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      order,
    });

  } catch (error) {
    console.error("Error verifying payment:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};