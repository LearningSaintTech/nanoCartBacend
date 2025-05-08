const PartnerOrder = require('../../models/Partner/PartnerOrder');
const Partner = require('../../models/Partner/Partner');
const Item = require('../../models/Items/Item');
const PartnerAddress = require('../../models/Partner/PartnerAddress');
const Wallet = require('../../models/Partner/PartnerWallet');
const PartnerCart = require('../../models/Partner/PartnerCart');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { apiResponse } = require('../../utils/apiResponse');
const { uploadImageToS3 } = require('../../utils/s3Upload');
const { razorpay } = require('../../config/razorpay');

// Controller to create a new PartnerOrder document
exports.createPartnerOrder = async (req, res) => {
  try {
    // Extract partnerId from req.user
    const { partnerId } = req.user;

    if (!partnerId) {
      return res.status(401).json(apiResponse(401, false, 'Unauthorized: Partner ID not found in request'));
    }

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid partnerId format'));
    }
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json(apiResponse(404, false, 'Partner not found'));
    }

    // Extract fields from req.body
    const {
      orderProductDetails,
      shippingAddressId,
      totalAmount,
      isWalletPayment,
      isOnlinePayment,
      isCodPayment,
      isChequePayment,
      walletAmountUsed,
    } = req.body;

    let chequeImageFile = null;
    if (req.files) {
      chequeImageFile = req.files.chequeImageFile;
    }

    // Validate required fields
    if (!orderProductDetails || !totalAmount || !shippingAddressId) {
      return res.status(400).json(apiResponse(400, false, 'orderProductDetails, shippingAddressId, and totalAmount are required'));
    }

    // Validate payment method selection
    const activeMethodsCount = [isWalletPayment, isOnlinePayment, isCodPayment, isChequePayment].filter(Boolean).length;
    if (activeMethodsCount === 0) {
      return res.status(400).json(apiResponse(400, false, 'At least one payment method must be selected'));
    }
    if (activeMethodsCount > 2 || (activeMethodsCount === 2 && !isWalletPayment)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid payment method combination; only wallet can be combined with one of online, cod, or cheque'));
    }

    // Generate unique orderId
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Validate orderProductDetails
    if (!Array.isArray(orderProductDetails) || orderProductDetails.length === 0) {
      return res.status(400).json(apiResponse(400, false, 'orderProductDetails must be a non-empty array'));
    }
    for (const detail of orderProductDetails) {
      if (!mongoose.Types.ObjectId.isValid(detail.itemId)) {
        return res.status(400).json(apiResponse(400, false, 'Invalid itemId format in orderProductDetails'));
      }
      const itemExists = await Item.findById(detail.itemId);
      if (!itemExists) {
        return res.status(404).json(apiResponse(404, false, `Item not found for itemId: ${detail.itemId}`));
      }
      if (!detail.orderDetails || !Array.isArray(detail.orderDetails)) {
        return res.status(400).json(apiResponse(400, false, 'orderDetails must contain a valid orderDetails array'));
      }
      for (const subDetail of detail.orderDetails) {
        if (subDetail.sizeAndQuantity && Array.isArray(subDetail.sizeAndQuantity)) {
          for (const sizeQty of subDetail.sizeAndQuantity) {
            if (!sizeQty.skuId || sizeQty.quantity < 1) {
              return res.status(400).json(apiResponse(400, false, 'skuId and valid quantity are required in sizeAndQuantity'));
            }
          }
        }
      }
    }

    // Validate items in cart
    const cart = await PartnerCart.findOne({ partnerId });
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json(apiResponse(400, false, 'Cart is empty or not found'));
    }

    // Check if all ordered items exist in cart with sufficient quantity
    for (const orderDetail of orderProductDetails) {
      for (const subDetail of orderDetail.orderDetails) {
        for (const sizeQty of subDetail.sizeAndQuantity || []) {
          const cartItem = cart.items.find(
            (item) =>
              item.itemId.toString() === orderDetail.itemId.toString() &&
              item.skuId === sizeQty.skuId &&
              item.color === subDetail.color &&
              item.size === sizeQty.size
          );
          if (!cartItem) {
            return res.status(400).json(apiResponse(400, false, `Item with skuId ${sizeQty.skuId} not found in cart`));
          }
          if (cartItem.quantity < sizeQty.quantity) {
            return res.status(400).json(apiResponse(400, false, `Insufficient quantity for skuId ${sizeQty.skuId} in cart`));
          }
        }
      }
    }

    // Validate shippingAddressId
    if (!mongoose.Types.ObjectId.isValid(shippingAddressId)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid shippingAddressId format'));
    }
    const addressExists = await PartnerAddress.findOne({
      partnerId,
      "addressDetail._id": shippingAddressId,
    });
    if (!addressExists) {
      return res.status(404).json(apiResponse(404, false, 'Shipping address not found'));
    }

    // Initialize payment amounts and fields
    let walletAmountUsedFinal = walletAmountUsed;
    let onlineAmount = 0;
    let codAmount = 0;
    let chequeAmount = 0;
    let razorpayOrderId = null;
    let chequeImages = null;
    let finalOrderStatus = 'In transit';

    // Handle payment logic based on booleans
    if (isWalletPayment) {
      // Fetch wallet for the partner
      const wallet = await Wallet.findOne({ partnerId });
      if (!wallet) {
        return res.status(404).json(apiResponse(404, false, 'Wallet not found for partner'));
      }
      const partnerWalletAmount = wallet.totalBalance || 0;
      if (walletAmountUsed <= 0) {
        return res.status(400).json(apiResponse(400, false, 'walletAmountUsed must be greater than 0 when isWalletPayment is true'));
      }
      if (walletAmountUsed > partnerWalletAmount) {
        return res.status(400).json(apiResponse(400, false, 'Insufficient wallet balance'));
      }
      if (walletAmountUsed > totalAmount) {
        return res.status(400).json(apiResponse(400, false, 'walletAmountUsed cannot exceed totalAmount'));
      }

      // Wallet + Online
      if (isOnlinePayment) {
        onlineAmount = totalAmount - walletAmountUsed;
        if (onlineAmount <= 0) {
          return res.status(400).json(apiResponse(400, false, 'Online amount must be greater than 0'));
        }
        const razorpayOrder = await razorpay.orders.create({
          amount: onlineAmount * 100, // Razorpay expects amount in paise
          currency: 'INR',
          receipt: orderId,
        });
        razorpayOrderId = razorpayOrder.id;
      }

      // Wallet + COD
      if (isCodPayment) {
        codAmount = totalAmount - walletAmountUsed;
        if (codAmount <= 0) {
          return res.status(400).json(apiResponse(400, false, 'COD amount must be greater than 0'));
        }
        finalOrderStatus = 'In transit';
      }

      // Wallet + Cheque
      if (isChequePayment) {
        if (!chequeImageFile) {
          return res.status(400).json(apiResponse(400, false, 'Cheque image file is required for cheque payment'));
        }
        const chequeImageUrl = await uploadImageToS3(chequeImageFile, 'cheque_images');
        chequeImages = { url: chequeImageUrl, uploadedAt: new Date() };
        chequeAmount = totalAmount - walletAmountUsed;
        if (chequeAmount <= 0) {
          return res.status(400).json(apiResponse(400, false, 'Cheque amount must be greater than 0'));
        }
      }

      // Only Wallet
      if (!isOnlinePayment && !isCodPayment && !isChequePayment) {
        if (walletAmountUsed < totalAmount) {
          return res.status(400).json(apiResponse(400, false, 'Insufficient wallet amount; totalAmount must equal walletAmountUsed'));
        }
        walletAmountUsedFinal = totalAmount;
        finalOrderStatus = 'In transit';
      }

      // Update wallet balance and add transaction
      wallet.totalBalance -= walletAmountUsedFinal;
      wallet.transactions.push({
        type: 'debit',
        amount: walletAmountUsedFinal,
        description: `Payment for order ${orderId}`,
        orderId,
        status: 'completed',
        createdAt: new Date(),
      });
      await wallet.save();
    } else {
      // Only Online
      if (isOnlinePayment && !isCodPayment && !isChequePayment) {
        onlineAmount = totalAmount;
        const razorpayOrder = await razorpay.orders.create({
          amount: onlineAmount * 100,
          currency: 'INR',
          receipt: orderId,
        });
        razorpayOrderId = razorpayOrder.id;
      }

      // Only COD
      if (isCodPayment && !isOnlinePayment && !isChequePayment) {
        codAmount = totalAmount;
        finalOrderStatus = 'In transit';
      }

      // Only Cheque
      if (isChequePayment && !isOnlinePayment && !isCodPayment) {
        if (!chequeImageFile) {
          return res.status(400).json(apiResponse(400, false, 'Cheque image file is required for cheque payment'));
        }
        const chequeImageUrl = await uploadImageToS3(chequeImageFile, 'cheque_images');
        chequeImages = { url: chequeImageUrl, uploadedAt: new Date() };
        chequeAmount = totalAmount;
        finalOrderStatus = 'In transit';
      }

      // Invalid single method
      if (activeMethodsCount > 1) {
        return res.status(400).json(apiResponse(400, false, 'Invalid payment method combination; select one of online, cod, or cheque when wallet is not used'));
      }
    }

    // Validate total amount
    const calculatedTotal = walletAmountUsedFinal + onlineAmount + codAmount + chequeAmount;
    if (calculatedTotal !== totalAmount) {
      return res.status(400).json(apiResponse(400, false, 'Total amount must equal the sum of wallet, online, cod, and cheque amounts'));
    }

    // Create new PartnerOrder document
    const newOrder = new PartnerOrder({
      orderId,
      partnerId,
      orderProductDetails,
      shippingAddressId,
      totalAmount,
      chequeImages,
      razorpayOrderId,
      walletAmountUsed: walletAmountUsedFinal,
      onlineAmount,
      codAmount,
      chequeAmount,
      isWalletPayment,
      isOnlinePayment,
      isCodPayment,
      isChequePayment,
      orderStatus: finalOrderStatus,
      isOrderPlaced: !isOnlinePayment, // False for online payments requiring verification
      deliveredAt: finalOrderStatus === 'Delivered' ? new Date() : undefined,
    });

    // Save the order
    await newOrder.save();

    // Remove ordered items from cart
    for (const orderDetail of orderProductDetails) {
      for (const subDetail of orderDetail.orderDetails) {
        for (const sizeQty of subDetail.sizeAndQuantity || []) {
          cart.items = cart.items.filter(
            (item) =>
              !(
                item.itemId.toString() === orderDetail.itemId.toString() &&
                item.skuId === sizeQty.skuId &&
                item.color === subDetail.color &&
                item.size === sizeQty.size
              )
          );
        }
      }
    }
    await cart.save();

    // Populate relevant fields for response
    const populatedOrder = await PartnerOrder.findById(newOrder._id)
      .populate({
        path: 'partnerId',
        select: 'name phoneNumber email',
      })
      .populate({
        path: 'orderProductDetails.itemId',
        select: 'name image',
      })
      .populate({
        path: 'shippingAddressId',
        select: 'address pincode city state',
      })
      .lean();

    // Send successful response
    return res.status(201).json(apiResponse(201, true, 'PartnerOrder created successfully', populatedOrder));
  } catch (error) {
    // Handle errors
    console.error('Error creating partner order:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while creating partner order'));
  }
};

// Controller to verify Razorpay payment
exports.verifyPayment = async (req, res) => {
  try {
    // Extract partnerId from req.user
    const { partnerId } = req.user;

    if (!partnerId) {
      return res.status(401).json(apiResponse(401, false, 'Unauthorized: Partner ID not found in request'));
    }

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid partnerId format'));
    }

    // Extract payment details from req.body
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    // Validate required fields
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json(apiResponse(400, false, 'razorpayOrderId, razorpayPaymentId, and razorpaySignature are required'));
    }

    // Find the order
    const order = await PartnerOrder.findOne({ razorpayOrderId, partnerId, isOnlinePayment: true });
    if (!order) {
      return res.status(404).json(apiResponse(404, false, 'Order not found or not associated with online payment'));
    }

    // Verify payment signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      return res.status(400).json(apiResponse(400, false, 'Invalid payment signature'));
    }

    // Update order with payment details
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;
    order.isOrderPlaced = true;
    order.orderStatus = 'In transit';
    await order.save();

    // Populate relevant fields for response
    const populatedOrder = await PartnerOrder.findById(order._id)
      .populate({
        path: 'partnerId',
        select: 'name phoneNumber email',
      })
      .populate({
        path: 'orderProductDetails.itemId',
        select: 'name image',
      })
      .populate({
        path: 'shippingAddressId',
        select: 'address pincode city state',
      })
      .lean();

    // Send successful response
    return res.status(200).json(apiResponse(200, true, 'Payment verified successfully', populatedOrder));
  } catch (error) {
    // Handle errors
    console.error('Error verifying payment:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while verifying payment'));
  }
};