const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/verifyToken');
const { isAdmin } = require('../../middlewares/isAdmin');
const mongoose = require('mongoose');
const UserOrder = require('../../models/User/UserOrder');
const PartnerOrder = require('../../models/Partner/PartnerOrder');
const ItemDetail = require('../../models/Items/ItemDetail');
const UserAddress = require('../../models/User/UserAddress');
const { randomUUID } = require('crypto');
const { apiResponse } = require('../../utils/apiResponse');

// Populate order details helper function
const populateOrderDetails = async (orders, userId) => {
  try {
    // Normalize input to array
    const ordersArray = Array.isArray(orders) ? orders : [orders];

    if (ordersArray.length === 0) {
      return Array.isArray(orders) ? [] : null;
    }

    // Populate user details
    const populatedOrders = await UserOrder.populate(ordersArray, {
      path: 'userId',
      model: 'User',
      select: 'name email phone role',
    });

    const enrichedOrders = await Promise.all(
      populatedOrders.map(async (order) => {
        // Validate userId for this order
        if (!order.userId || !mongoose.Types.ObjectId.isValid(order.userId._id)) {
          console.warn(`Skipping order ${order._id}: Invalid or missing userId`, randomUUID());
          return { ...order.toObject(), error: 'Invalid or missing userId' };
        }

        // Populate item histology
        const populatedOrder = await UserOrder.populate(order, {
          path: 'orderDetails.itemId',
          model: 'Item',
          select: 'name description MRP discountedPrice',
        });

        let shippingAddress = null;
        if (order.shippingAddressId && mongoose.Types.ObjectId.isValid(order.shippingAddressId)) {
          try {
            const userAddress = await UserAddress.findOne({
              userId: order.userId._id,
              'addressDetail._id': order.shippingAddressId,
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
            console.log(
              `Error fetching shippingAddressId ${order.shippingAddressId} for order ${order._id}: ${error.message}`,
              randomUUID()
            );
          }
        }

        const enrichedOrderDetails = await Promise.all(
          populatedOrder.orderDetails.map(async (detail) => {
            let image = null;
            try {
              const itemDetail = await ItemDetail.findOne({ itemId: detail.itemId?._id });
              if (itemDetail) {
                const colorEntry = itemDetail.imagesByColor.find(
                  (entry) => entry.color.toLowerCase() === detail.color?.toLowerCase()
                );
                if (colorEntry && colorEntry.images && colorEntry.images.length > 0) {
                  const sortedImages = colorEntry.images.sort(
                    (a, b) => (a.priority || 0) - (b.priority || 0)
                  );
                  image = sortedImages[0]?.url || null;
                }
              }
            } catch (error) {
              console.log(
                `Error fetching image for itemId ${detail.itemId?._id} in order ${order._id}: ${error.message}`,
                randomUUID()
              );
            }

            let pickupLocation = null;
            if (
              detail.returnInfo?.pickupLocationId &&
              mongoose.Types.ObjectId.isValid(detail.returnInfo.pickupLocationId)
            ) {
              try {
                const userAddress = await UserAddress.findOne({
                  userId: order.userId._id,
                  'addressDetail._id': detail.returnInfo.pickupLocationId,
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
                console.log(
                  `Error fetching return pickupLocationId ${detail.returnInfo.pickupLocationId} for order ${order._id}: ${error.message}`,
                  randomUUID()
                );
              }
            }

            if (
              detail.exchangeInfo?.pickupLocationId &&
              mongoose.Types.ObjectId.isValid(detail.exchangeInfo.pickupLocationId)
            ) {
              try {
                const userAddress = await UserAddress.findOne({
                  userId: order.userId._id,
                  'addressDetail._id': detail.exchangeInfo.pickupLocationId,
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
                console.log(
                  `Error fetching exchange pickupLocationId ${detail.exchangeInfo.pickupLocationId} for order ${order._id}: ${error.message}`,
                  randomUUID()
                );
              }
            }

            return {
              ...detail.toObject(),
              itemId: detail.itemId
                ? {
                    _id: detail.itemId._id,
                    name: detail.itemId.name,
                    description: detail.itemId.description,
                    MRP: detail.itemId.MRP,
                    discountedPrice: detail.itemId.discountedPrice,
                    image,
                  }
                : null,
              returnInfo: detail.returnInfo
                ? { ...detail.returnInfo.toObject(), pickupLocationId: detail.returnInfo.pickupLocationId }
                : null,
              exchangeInfo: detail.exchangeInfo
                ? { ...detail.exchangeInfo.toObject(), pickupLocationId: detail.exchangeInfo.pickupLocationId }
                : null,
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
    console.error(`Error populating order details: ${error.message}`, randomUUID());
    throw error;
  }
};

exports.getAllUserOrders = async (req, res) => {
  console.log('[GET ALL USER ORDERS] Request received');
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const userOrders = await UserOrder.find({})
      .populate('orderDetails.itemId', 'name MRP discountedPrice image')
      .populate('shippingAddressId', 'addressDetail')
      .skip(skip)
      .limit(limit)
      .lean();    
    return res.status(200).json(apiResponse(200, true, 'User orders retrieved successfully', userOrders));
  } catch (error) {
    console.error('[GET ALL USER ORDERS] Error:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while fetching user orders', { error: error.message }));
  }
};

exports.getAllPartnerOrders = async (req, res) => { 
  console.log('[GET ALL PARTNER ORDERS] Request received');
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const partnerOrders = await PartnerOrder.find({})
      .populate('orderProductDetails.itemId', 'name MRP discountedPrice image')
      .populate('shippingAddressId', 'addressDetail')
      .skip(skip)
      .limit(limit)
      .lean();
    return res.status(200).json(apiResponse(200, true, 'Partner orders retrieved successfully', partnerOrders));
  } catch (error) {
    console.error('[GET ALL PARTNER ORDERS] Error:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while fetching partner orders', { error: error.message }));
  }
};

// Get user order details
exports.getUserOrderDetails = async (req, res) => {
  console.log('[GET USER ORDER DETAILS] Request received');
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid user ID'));
    }
    const orders = await UserOrder.find({ userId })
      .populate('orderDetails.itemId', 'name MRP discountedPrice image')
      .populate('shippingAddressId', 'addressDetail')
      .skip(skip)
      .limit(limit)
      .lean();
    const totalOrders = await UserOrder.countDocuments({ userId });
    if (!orders.length) {
      return res.status(404).json(apiResponse(404, false, 'No orders found for this user', { orders: [], totalOrders: 0 }));
    }
    console.log('[GET USER ORDER DETAILS] Orders:', orders.length, 'Total:', totalOrders);
    return res.status(200).json(apiResponse(200, true, 'User order details retrieved successfully', { orders, totalOrders, page, limit }));
  } catch (error) {
    console.error('[GET USER ORDER DETAILS] Error:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while fetching user order details', { error: error.message }));
  }
};

// Get all orders (user and partner)
exports.getAllOrders = async (req, res) => {
  console.log('[GET ALL ORDERS] Request received');
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const userOrders = await UserOrder.find({})
      .populate('orderDetails.itemId', 'name MRP discountedPrice image')
      .populate('shippingAddressId', 'addressDetail')
      .skip(skip)
      .limit(limit)
      .lean();
    const partnerOrders = await PartnerOrder.find({})
      .populate('orderProductDetails.itemId', 'name MRP discountedPrice image')
      .populate('shippingAddressId', 'addressDetail')
      .skip(skip)
      .limit(limit)
      .lean();
    const totalUserOrders = await UserOrder.countDocuments({});
    const totalPartnerOrders = await PartnerOrder.countDocuments({});
    const allOrders = { userOrders, partnerOrders, totalUserOrders, totalPartnerOrders, page, limit };
    console.log('[GET ALL ORDERS] User Orders:', userOrders.length, 'Partner Orders:', partnerOrders.length);
    return res.status(200).json(apiResponse(200, true, 'All orders retrieved successfully', allOrders));
  } catch (error) {
    console.error('[GET ALL ORDERS] Error:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while fetching all orders', { error: error.message }));
  }
};

// Filter orders by status
exports.filterOrdersByStatus = async (req, res) => {
  console.log('📥 [FILTER ORDERS BY STATUS] Request received');
  try {
    const status = req.query.status?.toLowerCase();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log('🔍 Parsed Query Params:', { status, page, limit, skip });

    if (!status) {
      console.warn('⚠️ Order status is missing in query');
      return res.status(400).json(apiResponse(400, false, 'Order status is required'));
    }

    const validUserStatuses = [
      'initiated', 'confirmed', 'ready for dispatch', 'dispatched', 'delivered', 'cancelled', 'returned'
    ];
    const validPartnerStatuses = [
      'in transit', 'confirmed', 'ready for dispatch', 'dispatched', 'delivered', 'partially returned', 'order returned'
    ];

    if (!validUserStatuses.includes(status) && !validPartnerStatuses.includes(status)) {
      console.warn('❌ Invalid order status provided:', status);
      return res.status(400).json(apiResponse(400, false, 'Invalid order status'));
    }

    console.log('📦 Fetching User Orders...');
    const userOrders = await UserOrder.find({
      orderStatus: { $regex: `^${status}$`, $options: 'i' }
    })
      .populate('orderDetails.itemId', 'name MRP discountedPrice image')
      .populate('shippingAddressId', 'addressDetail')
      .skip(skip)
      .limit(limit)
      .lean();

    console.log('✅ User Orders fetched:', userOrders.length);

    console.log('🚚 Fetching Partner Orders...');
    const partnerOrders = await PartnerOrder.find({
      orderStatus: { $regex: `^${status}$`, $options: 'i' }
    })
      .populate('orderProductDetails.itemId', 'name MRP discountedPrice image')
      .populate('shippingAddressId', 'addressDetail')
      .skip(skip)
      .limit(limit)
      .lean();

    console.log('✅ Partner Orders fetched:', partnerOrders.length);

    const totalUserOrders = await UserOrder.countDocuments({
      orderStatus: { $regex: `^${status}$`, $options: 'i' }
    });
    const totalPartnerOrders = await PartnerOrder.countDocuments({
      orderStatus: { $regex: `^${status}$`, $options: 'i' }
    });

    console.log('🔢 Total Counts => User:', totalUserOrders, 'Partner:', totalPartnerOrders);

    const filteredOrders = {
      userOrders,
      partnerOrders,
      totalUserOrders,
      totalPartnerOrders,
      page,
      limit
    };

    console.log('✅ [FILTER ORDERS BY STATUS] Success for status:', status);
    return res.status(200).json(apiResponse(200, true, 'Orders filtered by status successfully', filteredOrders));
  } catch (error) {
    console.error('❌ [FILTER ORDERS BY STATUS] Error:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while filtering orders by status', {
      error: error.message
    }));
  }
};

// Filter orders by payment mode
exports.filterOrdersByPaymentMode = async (req, res) => {
  console.log('[FILTER ORDERS BY PAYMENT MODE] Request received');
  try {
    const paymentMode = req.query.paymentMode?.toLowerCase();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!paymentMode) {
      return res.status(400).json(apiResponse(400, false, 'Payment mode is required'));
    }
    const validUserPaymentModes = ['online', 'cod'];
    const validPartnerPaymentModes = ['online', 'cod', 'cheque', 'wallet'];
    let userOrders = [];
    let totalUserOrders = 0;
    let partnerOrders = [];
    let totalPartnerOrders = 0;

    if (validUserPaymentModes.includes(paymentMode)) {
      userOrders = await UserOrder.find({ paymentMethod: { $regex: `^${paymentMode}$`, $options: 'i' } })
        .populate('orderDetails.itemId', 'name MRP discountedPrice image')
        .populate('shippingAddressId', 'addressDetail')
        .skip(skip)
        .limit(limit)
        .lean();
      totalUserOrders = await UserOrder.countDocuments({ paymentMethod: { $regex: `^${paymentMode}$`, $options: 'i' } });
    }
    if (validPartnerPaymentModes.includes(paymentMode)) {
      const paymentFieldMap = { online: 'isOnlinePayment', cod: 'isCodPayment', cheque: 'isChequePayment', wallet: 'isWalletPayment' };
      partnerOrders = await PartnerOrder.find({ [paymentFieldMap[paymentMode]]: true })
        .populate('orderProductDetails.itemId', 'name MRP discountedPrice image')
        .populate('shippingAddressId', 'addressDetail')
        .skip(skip)
        .limit(limit)
        .lean();
      totalPartnerOrders = await PartnerOrder.countDocuments({ [paymentFieldMap[paymentMode]]: true });
    }
    if (!validUserPaymentModes.includes(paymentMode) && !validPartnerPaymentModes.includes(paymentMode)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid payment mode'));
    }
    const filteredOrders = { userOrders, partnerOrders, totalUserOrders, totalPartnerOrders, page, limit };
    console.log('[FILTER ORDERS BY PAYMENT MODE] Payment Mode:', paymentMode, 'User Orders:', userOrders.length, 'Partner Orders:', partnerOrders.length);
    return res.status(200).json(apiResponse(200, true, 'Orders filtered by payment mode successfully', filteredOrders));
  } catch (error) {
    console.error('[FILTER ORDERS BY PAYMENT MODE] Error:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while filtering orders by payment mode', { error: error.message }));
  }
};

// Get total revenue
exports.getTotalRevenue = async (req, res) => {
  console.log('[GET TOTAL REVENUE] Request received');
  try {
    const userRevenueResult = await UserOrder.aggregate([
      { $match: { paymentStatus: 'Paid' } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } },
    ]);
    const partnerRevenueResult = await PartnerOrder.aggregate([
      { $match: { paymentStatus: 'Paid' } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } },
    ]);
    const userRevenue = userRevenueResult.length > 0 ? userRevenueResult[0].totalRevenue : 0;
    const partnerRevenue = partnerRevenueResult.length > 0 ? partnerRevenueResult[0].totalRevenue : 0;
    const totalRevenue = userRevenue + partnerRevenue;
    console.log('[GET TOTAL REVENUE] User Revenue:', userRevenue, 'Partner Revenue:', partnerRevenue, 'Total:', totalRevenue);
    return res.status(200).json(apiResponse(200, true, 'Total revenue retrieved successfully', { userRevenue, partnerRevenue, totalRevenue }));
  } catch (error) {
    console.error('[GET TOTAL REVENUE] Error:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while fetching total revenue', { error: error.message }));
  }
};

// Helper function to calculate date ranges
const getDateRange = (filterType) => {
  const now = new Date();
  let start, end = now;

  switch (filterType) {
    case "lastDay":
      start = new Date(now.setHours(0, 0, 0, 0));
      break;
    case "lastWeek":
      start = new Date(now.setDate(now.getDate() - 7));
      start.setHours(0, 0, 0, 0);
      break;
    case "lastMonth":
      start = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case "lastYear":
      start = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
    default:
      throw new Error("Invalid filter type");
  }

  return { start, end };
};

// Get total revenue with filters
exports.getFilteredTotalRevenue = async (req, res) => {
  console.log('[GET FILTERED TOTAL REVENUE] Request received');
  try {
    const { filterType } = req.query;
    console.log(req.query);

    // Validate filterType
    const validFilters = ["lastDay", "lastWeek", "lastMonth", "lastYear"];
    if (!validFilters.includes(filterType)) {
      return res.status(400).json(apiResponse(400, false, "Invalid filter type. Use lastDay, lastWeek, lastMonth, or lastYear"));
    }

    // Get date range based on filter
    const { start, end } = getDateRange(filterType);

    // Aggregate revenue for UserOrder
    const userRevenueResult = await UserOrder.aggregate([
      { $match: { paymentStatus: "Paid", createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
    ]);

    // Aggregate revenue for PartnerOrder
    const partnerRevenueResult = await PartnerOrder.aggregate([
      { $match: { paymentStatus: "Paid", createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
    ]);

    const userRevenue = userRevenueResult.length > 0 ? userRevenueResult[0].totalRevenue : 0;
    const partnerRevenue = partnerRevenueResult.length > 0 ? partnerRevenueResult[0].totalRevenue : 0;
    const totalRevenue = userRevenue + partnerRevenue;

    console.log(`[GET FILTERED TOTAL REVENUE] Filter: ${filterType}, User Revenue: ${userRevenue}, Partner Revenue: ${partnerRevenue}, Total: ${totalRevenue}`);
    return res.status(200).json(
      apiResponse(200, true, "Filtered total revenue retrieved successfully", {
        userRevenue,
        partnerRevenue,
        totalRevenue,
        filterType,
        startDate: start,
        endDate: end,
      })
    );
  } catch (error) {
    console.error("[GET FILTERED TOTAL REVENUE] Error:", error);
    return res.status(500).json(apiResponse(500, false, "An error occurred while fetching filtered total revenue", { error: error.message }));
  }
};

// Get items by ordered number
exports.getItemsByOrderedNumber = async (req, res) => {
  console.log('[GET ITEMS BY ORDERED NUMBER] Request received');
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const userItemOrders = await UserOrder.aggregate([
      { $unwind: '$orderDetails' },
      { $group: { _id: '$orderDetails.itemId', totalOrdered: { $sum: '$orderDetails.quantity' } } },
      { $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'itemDetails' } },
      { $unwind: '$itemDetails' },
      { $project: { itemId: '$_id', name: '$itemDetails.name', MRP: '$itemDetails.MRP', discountedPrice: '$itemDetails.discountedPrice', image: '$itemDetails.image', totalOrdered: 1 } },
    ]);
    const partnerItemOrders = await PartnerOrder.aggregate([
      { $unwind: '$orderProductDetails' },
      { $group: { _id: '$orderProductDetails.itemId', totalOrdered: { $sum: '$orderProductDetails.totalQuantity' } } },
      { $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'itemDetails' } },
      { $unwind: '$itemDetails' },
      { $project: { itemId: '$_id', name: '$itemDetails.name', MRP: '$itemDetails.MRP', discountedPrice: '$itemDetails.discountedPrice', image: '$itemDetails.image', totalOrdered: 1 } },
    ]);
    const combinedItems = [...userItemOrders, ...partnerItemOrders].reduce((acc, item) => {
      const existing = acc.find((i) => i.itemId.toString() === item.itemId.toString());
      if (existing) {
        existing.totalOrdered += item.totalOrdered;
      } else {
        acc.push(item);
      }
      return acc;
    }, []);
    const sortedItems = combinedItems.sort((a, b) => b.totalOrdered - a.totalOrdered);
    const totalItems = sortedItems.length;
    const paginatedItems = sortedItems.slice(skip, skip + limit);
    console.log('[GET ITEMS BY ORDERED NUMBER] Items:', paginatedItems.length, 'Total:', totalItems);
    return res.status(200).json(apiResponse(200, true, 'Items by ordered number retrieved successfully', { items: paginatedItems, totalItems, page, limit }));
  } catch (error) {
    console.error('[GET ITEMS BY ORDERED NUMBER] Error:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while fetching items by ordered number', { error: error.message }));
  }
};

// Get partner order details
exports.getPartnerOrderDetails = async (req, res) => {
  console.log('[GET PARTNER ORDER DETAILS] Request received');
  try {
    const { partnerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid partner ID'));
    }
    const orders = await PartnerOrder.find({ partnerId })
      .populate('orderProductDetails.itemId', 'name MRP discountedPrice image')
      .populate('shippingAddressId', 'addressDetail')
      .skip(skip)
      .limit(limit)
      .lean();
    const totalOrders = await PartnerOrder.countDocuments({ partnerId });
    if (!orders.length) {
      return res.status(404).json(apiResponse(404, false, 'No orders found for this partner', { orders: [], totalOrders: 0 }));
    }
    console.log('[GET PARTNER ORDER DETAILS] Orders:', orders.length, 'Total:', totalOrders);
    return res.status(200).json(apiResponse(200, true, 'Partner order details retrieved successfully', { orders, totalOrders, page, limit }));
  } catch (error) {
    console.error('[GET PARTNER ORDER DETAILS] Error:', error);
    return res.status(500).json(apiResponse(500, false, 'An error occurred while fetching partner order details', { error: error.message }));
  }
};

// ________________________________________________________________________________________________________________________________________________________________________________


// Get total count of all orders
exports.getTotalUserOrdersCount = async (req, res) => {
  try {
    const totalOrders = await UserOrder.countDocuments();
    return res.status(200).json(apiResponse(200, true, 'Total orders fetched successfully', { totalOrders }));
  } catch (error) {
    console.error('Error fetching total orders:', error);
    return res.status(500).json(apiResponse(500, false, 'Internal server error', { error: error.message }));
  }
};

// Get total count of all partner orders
exports.getTotalPartnerOrdersCount = async (req, res) => {
  try {
    console.log("111111111111");
    const totalOrders = await PartnerOrder.countDocuments();
    return res.status(200).json(apiResponse(200, true, 'Total partner orders fetched successfully', { totalOrders }));
  } catch (error) {
    console.error('Error fetching total partner orders:', error);
    return res.status(500).json(apiResponse(500, false, 'Internal server error', { error: error.message }));
  }
};



// Get total count of confirmed user orders
exports.getTotalConfirmedUserOrdersCount = async (req, res) => {
  try {
    const totalConfirmedOrders = await UserOrder.countDocuments({ orderStatus: 'Confirmed' });
    return res.status(200).json(apiResponse(200, true, 'Total confirmed user orders fetched successfully', { totalConfirmedOrders }));
  } catch (error) {
    console.error('Error fetching confirmed user orders:', error);
    return res.status(500).json(apiResponse(500, false, 'Internal server error', { error: error.message }));
  }
};

// Get total count of confirmed partner orders
exports.getTotalConfirmedPartnerOrdersCount = async (req, res) => {
  try {
    const totalConfirmedOrders = await PartnerOrder.countDocuments({ orderStatus: 'Confirmed' });
    return res.status(200).json(apiResponse(200, true, 'Total confirmed partner orders fetched successfully', { totalConfirmedOrders }));
  } catch (error) {
    console.error('Error fetching confirmed partner orders:', error);
    return res.status(500).json(apiResponse(500, false, 'Internal server error', { error: error.message }));
  }
};

// Get total count of pending orders
exports.getTotalPendingUserOrdersCount = async (req, res) => {
  try {
    const totalPendingOrders = await UserOrder.countDocuments({ paymentStatus: 'Pending' });
    return res.status(200).json(apiResponse(200, true, 'Total pending orders fetched successfully', { totalPendingOrders }));
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    return res.status(500).json(apiResponse(500, false, 'Internal server error', { error: error.message }));
  }
};

// Get total count of pending partner orders
exports.getTotalPendingPartnerOrdersCount = async (req, res) => {
  try {
    const totalPendingOrders = await PartnerOrder.countDocuments({ paymentStatus: 'Pending' });
    return res.status(200).json(apiResponse(200, true, 'Total pending partner orders fetched successfully', { totalPendingOrders }));
  } catch (error) {
    console.error('Error fetching pending partner orders:', error);
    return res.status(500).json(apiResponse(500, false, 'Internal server error', { error: error.message }));
  }
};

// Get total count of cancelled orders
exports.getTotalCancelledUserOrdersCount = async (req, res) => {
  try {
    const totalCancelledOrders = await UserOrder.countDocuments({ orderStatus: 'Cancelled' });
    return res.status(200).json(apiResponse(200, true, 'Total cancelled orders fetched successfully', { totalCancelledOrders }));
  } catch (error) {
    console.error('Error fetching cancelled orders:', error);
    return res.status(500).json(apiResponse(500, false, 'Server error', { error: error.message }));
  }
};

// Get total count of returned orders
exports.getTotalReturnedUserOrdersCount = async (req, res) => {
  try {
    const totalReturnedOrders = await UserOrder.countDocuments({ orderStatus: { $in: ['Returned', 'Partially Returned'] } });
    return res.status(200).json(apiResponse(200, true, 'Total returned orders fetched successfully', { totalReturnedOrders }));
  } catch (error) {
    console.error('Error fetching returned orders:', error);
    return res.status(500).json(apiResponse(500, false, 'Server error', { error: error.message }));
  }
};

// Get total count of returned partner orders
exports.getTotalReturnedPartnerOrdersCount = async (req, res) => {
  try {
    const totalReturnedOrders = await PartnerOrder.countDocuments({ orderStatus: { $in: ['Order Returned', 'Partially Returned'] } });
    return res.status(200).json(apiResponse(200, true, 'Total returned partner orders fetched successfully', { totalReturnedOrders }));
  } catch (error) {
    console.error('Error fetching returned partner orders:', error);
    return res.status(500).json(apiResponse(500, false, 'Server error', { error: error.message }));
  }
};

// Get total count of exchanged orders
exports.getTotalExchangedUserOrdersCount = async (req, res) => {
  try {
    const totalExchangedOrders = await UserOrder.countDocuments({ orderStatus: { $in: ['Exchanged', 'Partially Exchanged'] } });
    return res.status(200).json(apiResponse(200, true, 'Total exchanged orders fetched successfully', { totalExchangedOrders }));
  } catch (error) {
    console.error('Error fetching exchanged orders:', error);
    return res.status(500).json(apiResponse(500, false, 'Server error', { error: error.message }));
  }
};

// Get total count of dispatched orders
exports.getTotalDispatchedUserOrdersCount = async (req, res) => {
  try {
    const totalDispatchedOrders = await UserOrder.countDocuments({ orderStatus: 'Dispatched' });
    return res.status(200).json(apiResponse(200, true, 'Total dispatched orders fetched successfully', { totalDispatchedOrders }));
  } catch (error) {
    console.error('Error fetching dispatched orders:', error);
    return res.status(500).json(apiResponse(500, false, 'Server error', { error: error.message }));
  }
};


// Get all pending orders with count and populated details
exports.getAllPendingOrdersUser = async (req, res) => {
  try {
    const orders = await UserOrder.find({ paymentStatus: 'Pending' }).sort({ createdAt: -1 });
    const totalPendingOrders = orders.length;
    if (!orders || totalPendingOrders === 0) {
      return res.status(200).json(apiResponse(200, true, 'No pending orders found', { totalPendingOrders: 0, orders: [] }));
    }
    const populatedOrders = await populateOrderDetails(orders, orders[0].userId);
    return res.status(200).json(apiResponse(200, true, 'Pending orders fetched successfully', { totalPendingOrders, orders: populatedOrders }));
  } catch (error) {
    console.error('Error fetching pending orders:', error.message);
    return res.status(500).json(apiResponse(500, false, error.message || 'Internal server error'));
  }
};

// Get all cancelled orders with count and populated details
exports.getAllCancelledOrdersUser = async (req, res) => {
  try {
    const orders = await UserOrder.find({ orderStatus: 'Cancelled' }).sort({ createdAt: -1 });
    const totalCancelledOrders = orders.length;
    if (!orders || totalCancelledOrders === 0) {
      return res.status(200).json(apiResponse(200, true, 'No cancelled orders found', { totalCancelledOrders: 0, orders: [] }));
    }
    const populatedOrders = await populateOrderDetails(orders, orders[0].userId);
    return res.status(200).json(apiResponse(200, true, 'Cancelled orders fetched successfully', { totalCancelledOrders, orders: populatedOrders }));
  } catch (error) {
    console.error('Error fetching cancelled orders:', error.message);
    return res.status(500).json(apiResponse(500, false, error.message || 'Internal server error'));
  }
};

// Get all returned orders with count and populated details
exports.getAllReturnedOrdersUser = async (req, res) => {
  try {
    const orders = await UserOrder.find({ orderStatus: { $in: ['Returned', 'Partially Returned'] } }).sort({ createdAt: -1 });
    const totalReturnedOrders = orders.length;
    if (!orders || totalReturnedOrders === 0) {
      return res.status(200).json(apiResponse(200, true, 'No returned orders found', { totalReturnedOrders: 0, orders: [] }));
    }
    const populatedOrders = await populateOrderDetails(orders, orders[0].userId);
    return res.status(200).json(apiResponse(200, true, 'Returned orders fetched successfully', { totalReturnedOrders, orders: populatedOrders }));
  } catch (error) {
    console.error('Error fetching returned orders:', error.message);
    return res.status(500).json(apiResponse(500, false, error.message || 'Internal server error'));
  }
};

// Get all exchanged orders with count and populated details
exports.getAllExchangedOrdersUser = async (req, res) => {
  try {
    const orders = await UserOrder.find({ orderStatus: { $in: ['Exchanged', 'Partially Exchanged'] } }).sort({ createdAt: -1 });
    const totalExchangedOrders = orders.length;
    if (!orders || totalExchangedOrders === 0) {
      return res.status(200).json(apiResponse(200, true, 'No exchanged orders found', { totalExchangedOrders: 0, orders: [] }));
    }
    const populatedOrders = await populateOrderDetails(orders, orders[0].userId);
    return res.status(200).json(apiResponse(200, true, 'Exchanged orders fetched successfully', { totalExchangedOrders, orders: populatedOrders }));
  } catch (error) {
    console.error('Error fetching exchanged orders:', error.message);
    return res.status(500).json(apiResponse(500, false, error.message || 'Internal server error'));
  }
};

// Get all dispatched orders with count and populated details
exports.getAllDispatchedOrdersUser = async (req, res) => {
  try {
    const orders = await UserOrder.find({ orderStatus: 'Dispatched' }).sort({ createdAt: -1 });
    const totalDispatchedOrders = orders.length;
    if (!orders || totalDispatchedOrders === 0) {
      return res.status(200).json(apiResponse(200, true, 'No dispatched orders found', { totalDispatchedOrders: 0, orders: [] }));
    }
    const populatedOrders = await populateOrderDetails(orders, orders[0].userId);
    return res.status(200).json(apiResponse(200, true, 'Dispatched orders fetched successfully', { totalDispatchedOrders, orders: populatedOrders }));
  } catch (error) {
    console.error('Error fetching dispatched orders:', error.message);
    return res.status(500).json(apiResponse(500, false, error.message || 'Internal server error'));
  }
};



// Get all pending orders with count and populated details
exports.getAllPendingOrdersPartner = async (req, res) => {
  try {
    const orders = await PartnerOrder.find({ paymentStatus: "Pending" }).sort({ createdAt: -1 });
    const totalPendingOrders = orders.length;
    if (!orders || totalPendingOrders === 0) {
      return res.status(200).json(apiResponse(200, true, "No pending orders found", { totalPendingOrders: 0, orders: [] }));
    }
    const populatedOrders = await populateOrderDetails(orders, orders[0].partnerId);
    return res.status(200).json(apiResponse(200, true, "Pending orders fetched successfully", { totalPendingOrders, orders: populatedOrders }));
  } catch (error) {
    console.error("Error fetching pending partner orders:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message || "Internal server error"));
  }
};



// Get all returned orders with count and populated details
exports.getAllReturnedOrdersPartner = async (req, res) => {
  try {
    const orders = await PartnerOrder.find({ orderStatus: { $in: ["Order Returned", "Partially Returned"] } }).sort({ createdAt: -1 });
    const totalReturnedOrders = orders.length;
    if (!orders || totalReturnedOrders === 0) {
      return res.status(200).json(apiResponse(200, true, "No returned orders found", { totalReturnedOrders: 0, orders: [] }));
    }
    const populatedOrders = await populateOrderDetails(orders, orders[0].partnerId);
    return res.status(200).json(apiResponse(200, true, "Returned orders fetched successfully", { totalReturnedOrders, orders: populatedOrders }));
  } catch (error) {
    console.error("Error fetching returned partner orders:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message || "Internal server error"));
  }
};



// Get all dispatched orders with count and populated details
exports.getAllDispatchedOrdersPartner = async (req, res) => {
  try {
    const orders = await PartnerOrder.find({ orderStatus: "Dispatched" }).sort({ createdAt: -1 });
    const totalDispatchedOrders = orders.length;
    if (!orders || totalDispatchedOrders === 0) {
      return res.status(200).json(apiResponse(200, true, "No dispatched orders found", { totalDispatchedOrders: 0, orders: [] }));
    }
    const populatedOrders = await populateOrderDetails(orders, orders[0].partnerId);
    return res.status(200).json(apiResponse(200, true, "Dispatched orders fetched successfully", { totalDispatchedOrders, orders: populatedOrders }));
  } catch (error) {
    console.error("Error fetching dispatched partner orders:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message || "Internal server error"));
  }
};