const PartnerOrder = require('../../models/Partner/PartnerOrder');
const Partner = require('../../models/Partner/Partner');
const Item = require('../../models/Items/Item');
const ItemDetail = require('../../models/Items/ItemDetail');
const PartnerAddress = require('../../models/Partner/PartnerAddress');
const Wallet = require('../../models/Partner/PartnerWallet');
const PartnerCart = require('../../models/Partner/PartnerCart');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { apiResponse } = require('../../utils/apiResponse');
const { uploadImageToS3 } = require('../../utils/s3Upload');
const { razorpay } = require('../../config/razorpay');

// Function to populate order details
const populateOrderDetails = async (orderId, partnerId) => {
  try {
    // Fetch and populate order
    let populatedOrder = await PartnerOrder.findOne({ _id: orderId, partnerId })
      .populate({
        path: 'partnerId',
        select: 'name phoneNumber email',
      })
      .populate({
        path: 'orderProductDetails.itemId',
        select: 'name description MRP discountedPrice',
      })
      .lean();

    if (!populatedOrder) {
      throw new Error('Order not found or does not belong to partner');
    }

    // Fetch shipping address details
    let shippingAddress = null;
    if (populatedOrder.shippingAddressId && mongoose.Types.ObjectId.isValid(populatedOrder.shippingAddressId)) {
      const partnerAddress = await PartnerAddress.findOne({
        partnerId,
        "addressDetail._id": populatedOrder.shippingAddressId,
      });
      if (partnerAddress) {
        const matchedAddress = partnerAddress.addressDetail.find(
          (addr) => addr._id.toString() === populatedOrder.shippingAddressId.toString()
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
    }

    // Enrich orderProductDetails with images
    populatedOrder.orderProductDetails = await Promise.all(
      populatedOrder.orderProductDetails.map(async (detail) => {
        const enrichedOrderDetails = await Promise.all(
          detail.orderDetails.map(async (subDetail) => {
            let image = null;
            try {
              const itemDetail = await ItemDetail.findOne({
                itemId: detail.itemId._id,
              });
              if (itemDetail) {
                const colorEntry = itemDetail.imagesByColor.find(
                  (entry) => entry.color.toLowerCase() === subDetail.color.toLowerCase()
                );
                if (colorEntry) {
                  const sizeEntry = colorEntry.sizes.find((s) =>
                    subDetail.sizeAndQuantity.some(
                      (sizeQty) => sizeQty.size === s.size && sizeQty.skuId === s.skuId
                    )
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
                `Error fetching image for itemId ${detail.itemId._id}, color ${subDetail.color}:`,
                error.message
              );
              // Continue processing but include a warning in the response
              populatedOrder.warnings = populatedOrder.warnings || [];
              populatedOrder.warnings.push(`Failed to fetch image for itemId ${detail.itemId._id}, color ${subDetail.color}`);
            }
            return {
              ...subDetail,
              image,
            };
          })
        );
        return {
          ...detail,
          itemId: {
            _id: detail.itemId._id,
            name: detail.itemId.name,
            description: detail.itemId.description,
            MRP: detail.itemId.MRP,
            discountedPrice: detail.itemId.discountedPrice,
          },
          orderDetails: enrichedOrderDetails,
        };
      })
    );

    // Add shipping address to response
    populatedOrder.shippingAddress = shippingAddress;

    // Populate returnInfo.pickupLocationId
    let pickupLocation = null;
    if (populatedOrder.returnInfo && populatedOrder.returnInfo.pickupLocationId &&
        mongoose.Types.ObjectId.isValid(populatedOrder.returnInfo.pickupLocationId)) {
      try {
        const partnerAddress = await PartnerAddress.findOne({
          partnerId,
          "addressDetail._id": populatedOrder.returnInfo.pickupLocationId,
        });
        if (partnerAddress) {
          const matchedAddress = partnerAddress.addressDetail.find(
            (addr) => addr._id.toString() === populatedOrder.returnInfo.pickupLocationId.toString()
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
            populatedOrder.returnInfo.pickupLocation = pickupLocation;
          }
        }
      } catch (error) {
        console.error(
          `Error fetching pickupLocationId ${populatedOrder.returnInfo.pickupLocationId} for order ${populatedOrder.orderId}:`,
          error.message
        );
        populatedOrder.warnings = populatedOrder.warnings || [];
        populatedOrder.warnings.push(`Failed to fetch pickup location for order ${populatedOrder.orderId}`);
      }
    }

    return populatedOrder;
  } catch (error) {
    console.error('Error populating order details:', error);
    throw error;
  }
};

// Controller to create a new PartnerOrder document
exports.createPartnerOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Extract partnerId from req.user
    const { partnerId } = req.user;

    if (!partnerId) {
      throw new Error('Unauthorized: Partner ID not found in request');
    }

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      throw new Error('Invalid partnerId format');
    }
    const partner = await Partner.findById(partnerId).session(session);
    if (!partner) {
      throw new Error('Partner not found');
    }

    // Extract fields from req.body
    const {
      orderProductDetails,
      shippingAddressId,
      totalAmount,
      invoice,
      isWalletPayment = false,
      isOnlinePayment = false,
      isCodPayment = false,
      isChequePayment = false,
      walletAmountUsed = 0,
    } = req.body;

    let chequeImageFile = null;
    if (req.files) {
      chequeImageFile = req.files.chequeImageFile;
    }

    // Validate required fields
    if (!orderProductDetails || !totalAmount || !shippingAddressId) {
      throw new Error('orderProductDetails, shippingAddressId, and totalAmount are required');
    }

    // Validate invoice
    if (!invoice || !Array.isArray(invoice) || invoice.length === 0) {
      throw new Error('Invoice must be a non-empty array');
    }
    for (const inv of invoice) {
      if (!inv.key || typeof inv.key !== 'string' || inv.key.trim() === '' ||
          !inv.value || typeof inv.value !== 'string' || inv.value.trim()==='') {
        throw new Error('Each invoice entry must have a non-empty key and value');
      }
    }

    // Validate payment method selection
    const activeMethodsCount = [isWalletPayment, isOnlinePayment, isCodPayment, isChequePayment].filter(Boolean).length;
    if (activeMethodsCount === 0) {
      throw new Error('At least one payment method must be selected');
    }
    if (activeMethodsCount > 2 || (activeMethodsCount === 2 && !isWalletPayment)) {
      throw new Error('Invalid payment method combination; only wallet can be combined with one of online, cod, or cheque');
    }

    // Generate unique orderId
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Validate orderProductDetails
    if (!Array.isArray(orderProductDetails) || orderProductDetails.length === 0) {
      throw new Error('orderProductDetails must be a non-empty array');
    }
    for (const detail of orderProductDetails) {
      if (!mongoose.Types.ObjectId.isValid(detail.itemId)) {
        throw new Error('Invalid itemId format in orderProductDetails');
      }
      const itemExists = await Item.findById(detail.itemId).session(session);
      if (!itemExists) {
        throw new Error(`Item not found for itemId: ${detail.itemId}`);
      }
      if (!detail.orderDetails || !Array.isArray(detail.orderDetails)) {
        throw new Error('orderDetails must contain a valid orderDetails array');
      }
      for (const subDetail of detail.orderDetails) {
        if (subDetail.sizeAndQuantity && Array.isArray(subDetail.sizeAndQuantity)) {
          for (const sizeQty of subDetail.sizeAndQuantity) {
            if (!sizeQty.skuId || sizeQty.quantity < 1) {
              throw new Error('skuId and valid quantity are required in sizeAndQuantity');
            }
          }
        }
      }
    }

    // Validate items in cart
    const cart = await PartnerCart.findOne({ partnerId }).session(session);
    if (!cart || !cart.items || cart.items.length === 0) {
      throw new Error('Cart is empty or not found');
    }

    // Check if all ordered items exist in cart with sufficient quantity
    for (const orderDetail of orderProductDetails) {
      const cartItem = cart.items.find(
        (item) => item.itemId.toString() === orderDetail.itemId.toString()
      );
      if (!cartItem) {
        throw new Error(`Item with itemId ${orderDetail.itemId} not found in cart`);
      }
      for (const orderSubDetail of orderDetail.orderDetails) {
        const cartSubDetail = cartItem.orderDetails.find(
          (sub) => sub.color === orderSubDetail.color
        );
        if (!cartSubDetail) {
          throw new Error(`Color ${orderSubDetail.color} not found in cart for itemId ${orderDetail.itemId}`);
        }
        for (const orderSizeQty of orderSubDetail.sizeAndQuantity || []) {
          const cartSizeQty = cartSubDetail.sizeAndQuantity.find(
            (sizeQty) => sizeQty.skuId === orderSizeQty.skuId && sizeQty.size.toLowerCase() === orderSizeQty.size.toLowerCase()
          );
          if (!cartSizeQty) {
            throw new Error(`Item with skuId ${orderSizeQty.skuId} and size ${orderSizeQty.size} not found in cart`);
          }
          if (cartSizeQty.quantity < orderSizeQty.quantity) {
            throw new Error(`Insufficient quantity for skuId ${orderSizeQty.skuId} in cart`);
          }
        }
      }
    }

    // Validate shippingAddressId
    if (!mongoose.Types.ObjectId.isValid(shippingAddressId)) {
      throw new Error('Invalid shippingAddressId format');
    }
    const addressExists = await PartnerAddress.findOne({
      partnerId,
      "addressDetail._id": shippingAddressId,
    }).session(session);
    if (!addressExists) {
      throw new Error('Shipping address not found');
    }

    // Initialize payment amounts and fields
    let walletAmountUsedFinal = walletAmountUsed;
    let onlineAmount = 0;
    let codAmount = 0;
    let chequeAmount = 0;
    let razorpayOrderId = null;
    let chequeImages = null;
    let finalOrderStatus = 'In transit';
    let paymentStatus = 'Pending';

    // Handle payment logic and set paymentStatus
    if (isWalletPayment) {
      // Fetch wallet for the partner
      const wallet = await Wallet.findOne({ partnerId }).session(session);
      if (!wallet) {
        throw new Error('Wallet not found for partner');
      }
      const partnerWalletAmount = wallet.totalBalance || 0;
      if (walletAmountUsed <= 0) {
        throw new Error('walletAmountUsed must be greater than 0 when isWalletPayment is true');
      }
      if (walletAmountUsed > partnerWalletAmount) {
        throw new Error('Insufficient wallet balance');
      }
      if (walletAmountUsed > totalAmount) {
        throw new Error('walletAmountUsed cannot exceed totalAmount');
      }

      // Wallet + Online
      if (isOnlinePayment) {
        onlineAmount = totalAmount - walletAmountUsed;
        if (onlineAmount <= 0) {
          throw new Error('Online amount must be greater than 0');
        }
        const razorpayOrder = await razorpay.orders.create({
          amount: onlineAmount * 100, // Razorpay expects amount in paise
          currency: 'INR',
          receipt: orderId,
        });
        razorpayOrderId = razorpayOrder.id;
        paymentStatus = 'Pending'; // Updated to Paid in verifyPayment
      }

      // Wallet + COD
      if (isCodPayment) {
        codAmount = totalAmount - walletAmountUsed;
        if (codAmount <= 0) {
          throw new Error('COD amount must be greater than 0');
        }
        finalOrderStatus = 'In transit';
        paymentStatus = 'Pending';
      }

      // Wallet + Cheque
      if (isChequePayment) {
        if (!chequeImageFile) {
          throw new Error('Cheque image file is required for cheque payment');
        }
        const chequeImageUrl = await uploadImageToS3(chequeImageFile, 'cheque_images');
        chequeImages = { url: chequeImageUrl, uploadedAt: new Date() };
        chequeAmount = totalAmount - walletAmountUsed;
        if (chequeAmount <= 0) {
          throw new Error('Cheque amount must be greater than 0');
        }
        paymentStatus = 'Pending';
      }

      // Only Wallet
      if (!isOnlinePayment && !isCodPayment && !isChequePayment) {
        if (walletAmountUsed < totalAmount) {
          throw new Error('Insufficient wallet amount; totalAmount must equal walletAmountUsed');
        }
        walletAmountUsedFinal = totalAmount;
        finalOrderStatus = 'In transit';
        paymentStatus = 'Paid';
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
      await wallet.save({ session });
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
        paymentStatus = 'Pending'; // Updated to Paid in verifyPayment
      }

      // Only COD
      if (isCodPayment && !isOnlinePayment && !isChequePayment) {
        codAmount = totalAmount;
        finalOrderStatus = 'In transit';
        paymentStatus = 'Pending';
      }

      // Only Cheque
      if (isChequePayment && !isOnlinePayment && !isCodPayment) {
        if (!chequeImageFile) {
          throw new Error('Cheque image file is required for cheque payment');
        }
        const chequeImageUrl = await uploadImageToS3(chequeImageFile, 'cheque_images');
        chequeImages = { url: chequeImageUrl, uploadedAt: new Date() };
        chequeAmount = totalAmount;
        finalOrderStatus = 'In transit';
        paymentStatus = 'Pending';
      }

      // Invalid single method
      if (activeMethodsCount > 1) {
        throw new Error('Invalid payment method combination; select one of online, cod, or cheque when wallet is not used');
      }
    }

    // Validate total amount
    const calculatedTotal = walletAmountUsedFinal + onlineAmount + codAmount + chequeAmount;
    if (calculatedTotal !== totalAmount) {
      throw new Error('Total amount must equal the sum of wallet, online, cod, and cheque amounts');
    }

    // Create new PartnerOrder document
    const newOrder = new PartnerOrder({
      orderId,
      partnerId,
      orderProductDetails,
      shippingAddressId,
      totalAmount,
      invoice,
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
      paymentStatus,
      isOrderPlaced: !isOnlinePayment, // False for online payments requiring verification
      deliveredAt: finalOrderStatus === 'Delivered' ? new Date() : undefined,
    });

    // Save the order
    await newOrder.save({ session });

    // Remove ordered items from cart
    for (const orderDetail of orderProductDetails) {
      const cartItem = cart.items.find(
        (item) => item.itemId.toString() === orderDetail.itemId.toString()
      );
      if (cartItem) {
        for (const orderSubDetail of orderDetail.orderDetails) {
          const cartSubDetail = cartItem.orderDetails.find(
            (sub) => sub.color === orderSubDetail.color
          );
          if (cartSubDetail) {
            for (const orderSizeQty of orderSubDetail.sizeAndQuantity || []) {
              const cartSizeQty = cartSubDetail.sizeAndQuantity.find(
                (sizeQty) => sizeQty.skuId === orderSizeQty.skuId && sizeQty.size.toLowerCase() === orderSizeQty.size.toLowerCase()
              );
              if (cartSizeQty) {
                cartSizeQty.quantity -= orderSizeQty.quantity;
              }
            }
            // Remove sizeAndQuantity entries with quantity <= 0
            cartSubDetail.sizeAndQuantity = cartSubDetail.sizeAndQuantity.filter(
              (sizeQty) => sizeQty.quantity > 0
            );
          }
        }
        // Remove orderDetails with empty sizeAndQuantity
        cartItem.orderDetails = cartItem.orderDetails.filter(
          (sub) => sub.sizeAndQuantity.length > 0
        );
        // Recalculate totalQuantity
        cartItem.totalQuantity = cartItem.orderDetails.reduce(
          (total, sub) =>
            total +
            sub.sizeAndQuantity.reduce((sum, sizeQty) => sum + sizeQty.quantity, 0),
          0
        );
      }
    }
    // Remove items with empty orderDetails
    cart.items = cart.items.filter((item) => item.orderDetails.length > 0);
    await cart.save({ session });

    // Commit the transaction
    await session.commitTransaction();

    // Populate order details (outside transaction to avoid unnecessary complexity)
    const populatedOrder = await populateOrderDetails(newOrder._id, partnerId);

    // Send successful response
    return res.status(201).json(apiResponse(201, true, 'PartnerOrder created successfully', populatedOrder));
  } catch (error) {
    await session.abortTransaction();
    console.error('Error creating partner order:', error);
    return res.status(error.status || 500).json(apiResponse(error.status || 500, false, error.message || 'An error occurred while creating partner order'));
  } finally {
    session.endSession();
  }
};

// Controller to verify Razorpay payment
exports.verifyPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Extract partnerId from req.user
    const { partnerId } = req.user;

    if (!partnerId) {
      throw new Error('Unauthorized: Partner ID not found in request');
    }

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      throw new Error('Invalid partnerId format');
    }

    // Extract payment details from req.body
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    // Validate required fields
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new Error('razorpayOrderId, razorpayPaymentId, and razorpaySignature are required');
    }

    // Find the order
    const order = await PartnerOrder.findOne({ razorpayOrderId, partnerId, isOnlinePayment: true }).session(session);
    if (!order) {
      throw new Error('Order not found or not associated with online payment');
    }

    // Verify payment signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      order.paymentStatus = 'Failed';
      await order.save({ session });
      throw new Error('Invalid payment signature');
    }

    // Update order with payment details
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;
    order.isOrderPlaced = true;
    order.orderStatus = 'In transit';
    order.paymentStatus = 'Paid';
    await order.save({ session });

    // Commit the transaction
    await session.commitTransaction();

    // Populate order details
    const populatedOrder = await populateOrderDetails(order._id, partnerId);

    // Send successful response
    return res.status(200).json(apiResponse(200, true, 'Payment verified successfully', populatedOrder));
  } catch (error) {
    await session.abortTransaction();
    console.error('Error verifying payment:', error);
    return res.status(error.status || 500).json(apiResponse(error.status || 500, false, error.message || 'An error occurred while verifying payment'));
  } finally {
    session.endSession();
  }
};

// Controller to handle return and refund
exports.requestReturnAndRefund = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Extract partnerId from req.user
    const { partnerId } = req.user;

    if (!partnerId) {
      throw new Error('Unauthorized: Partner ID not found in request');
    }

    // Validate partnerId
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      throw new Error('Invalid partnerId format');
    }

    // Extract fields from req.body
    const { orderId, reason, pickupLocationId } = req.body;

    // Validate required fields
    if (!orderId || !reason || !pickupLocationId) {
      throw new Error('orderId, reason, and pickupLocationId are required');
    }

    // Validate reason
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new Error('Reason must be a non-empty string');
    }

    // Validate orderId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new Error('Invalid orderId format');
    }

    // Find the order
    const order = await PartnerOrder.findOne({ _id: orderId, partnerId }).session(session);
    if (!order) {
      throw new Error('Order not found');
    }

    // Check if order is eligible for return
    if (order.isOrderReturned) {
      throw new Error('Order has already been returned');
    }
    if (order.orderStatus !== 'Delivered') {
      throw new Error('Order must be in Delivered status to request a return');
    }
    if (!order.isOrderPlaced) {
      throw new Error('Order is not confirmed for return');
    }

    // Check if the order is within the return window (e.g., 7 days from delivery)
    if (order.deliveredAt) {
      const returnWindowDays = 7;
      const currentDate = new Date();
      const maxReturnDate = new Date(order.deliveredAt);
      maxReturnDate.setDate(maxReturnDate.getDate() + returnWindowDays);
      if (currentDate > maxReturnDate) {
        throw new Error('Return request is outside the allowed return window');
      }
    } else {
      throw new Error('Delivery date not set for the order');
    }

    // Check payment status for COD orders
    if (order.isCodPayment && order.paymentStatus !== 'Paid') {
      throw new Error('COD order payment must be confirmed before requesting a refund');
    }

    // Validate pickupLocationId
    if (!mongoose.Types.ObjectId.isValid(pickupLocationId)) {
      throw new Error('Invalid pickupLocationId format');
    }
    const addressExists = await PartnerAddress.findOne({
      partnerId,
      "addressDetail._id": pickupLocationId,
    }).session(session);
    if (!addressExists) {
      throw new Error('Pickup address not found');
    }

    // Calculate refund amount (totalAmount, with 50 deduction for COD orders)
    let refundAmount = order.totalAmount;
    if (order.isCodPayment) {
      refundAmount = order.totalAmount - 50;
      if (refundAmount <= 0) {
        throw new Error('Refund amount after COD deduction must be greater than 0');
      }
    }

    // Fetch wallet for the partner
    const wallet = await Wallet.findOne({ partnerId }).session(session);
    if (!wallet) {
      throw new Error('Wallet not found for partner');
    }

    // Generate a unique refund transaction ID
    const refundTransactionId = `REF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Update order with return and refund details
    order.isOrderReturned = true;
    order.orderStatus = 'Order Returned';
    order.returnInfo = {
      reason,
      requestDate: new Date(),
      pickupLocationId,
      refundTransactionId,
      refundAmount,
      refundStatus: 'Initiated',
    };
    order.paymentStatus = 'Refunded';

    // Update wallet balance and add transaction
    wallet.totalBalance += refundAmount;
    wallet.transactions.push({
      type: 'credit',
      amount: refundAmount,
      description: `Refund for order ${order.orderId}`,
      orderId: order.orderId,
      status: 'completed',
      createdAt: new Date(),
    });

    // Save order and wallet updates
    await Promise.all([
      order.save({ session }),
      wallet.save({ session }),
    ]);

    // Commit the transaction
    await session.commitTransaction();

    // Populate order details
    const populatedOrder = await populateOrderDetails(order._id, partnerId);

    // Send successful response
    return res.status(200).json(apiResponse(200, true, 'Return and refund request processed successfully', populatedOrder));
  } catch (error) {
    await session.abortTransaction();
    console.error('Error processing return and refund:', error);
    return res.status(error.status || 500).json(apiResponse(error.status || 500, false, error.message || 'An error occurred while processing return and refund'));
  } finally {
    session.endSession();
  }
};

// Controller to fetch all PartnerOrders for a partner
exports.fetchAllPartnerOrders = async (req, res) => {
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

    // Fetch all orders for the partner
    const orders = await PartnerOrder.find({ partnerId })
      .sort({ createdAt: -1 }) // Sort by creation date, newest first
      .lean();

    // Populate details for each order and collect summary info
    const populatedOrders = await Promise.all(
      orders.map(async (order) => {
        try {
          return await populateOrderDetails(order._id, partnerId);
        } catch (error) {
          console.error(`Error populating order ${order._id}:`, error.message);
          // Include order with a warning if population fails
          return {
            ...order,
            warnings: [`Failed to populate order details: ${error.message}`],
          };
        }
      })
    );

    // Create summary array with orderId, orderDate, numberOfItems, and itemNames
    const orderSummaries = populatedOrders.map((order) => {
      // Handle case where population failed and itemId might not be populated
      const itemNames = order.orderProductDetails
        ? order.orderProductDetails.map((detail) => 
            detail.itemId && detail.itemId.name ? detail.itemId.name : 'Unknown Item'
          )
        : [];
      
      return {
        orderId: order.orderId || order._id,
        orderDate: order.createdAt,
        numberOfItems: order.orderProductDetails ? order.orderProductDetails.length : 0,
        itemNames,
      };
    });

    // Send successful response with populated orders and summaries
    return res.status(200).json(
      apiResponse(200, true, 'All PartnerOrders fetched successfully', {
        orders: populatedOrders,
        orderSummaries,
      })
    );
  } catch (error) {
    console.error('Error fetching all partner orders:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while fetching all partner orders'));
  }
};