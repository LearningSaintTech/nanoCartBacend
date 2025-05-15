const mongoose = require("mongoose");
const PartnerOrder = require("../../models/Partner/PartnerOrder");
const Partner = require("../../models/Partner/Partner");
const Item = require("../../models/Items/Item");
const ItemDetail = require("../../models/Items/ItemDetail");
const PartnerAddress = require("../../models/Partner/PartnerAddress");
const Wallet = require("../../models/Partner/PartnerWallet");
const PartnerCart = require("../../models/Partner/PartnerCart");
const { apiResponse } = require("../../utils/apiResponse");
const { uploadImageToS3 } = require("../../utils/s3Upload");
const phonepeClient = require("../../config/phonepeClient");
const { StandardCheckoutPayRequest } = require("pg-sdk-node");
const { randomUUID } = require("crypto");

// Function to populate order details
const populateOrderDetails = async (orderId, partnerId) => {
  try {
    let populatedOrder = await PartnerOrder.findOne({ _id: orderId, partnerId })
      .populate({
        path: "partnerId",
        select: "name phoneNumber email",
      })
      .populate({
        path: "orderProductDetails.itemId",
        select: "name description MRP discountedPrice image",
      })
      .lean();

    if (!populatedOrder) {
      throw new Error("Order not found or does not belong to partner");
    }

    // Log populated itemId data for debugging
    populatedOrder.orderProductDetails.forEach((detail) => {
      if (!detail.itemId.image) {
        console.warn(
          `[populateOrderDetails] Missing image for itemId ${detail.itemId._id}`
        );
        populatedOrder.warnings = populatedOrder.warnings || [];
        populatedOrder.warnings.push(
          `Missing image in Item document for itemId ${detail.itemId._id}`
        );
      } else {
        console.log(
          `[populateOrderDetails] Item image for itemId ${detail.itemId._id}:`,
          detail.itemId.image
        );
      }
    });

    let shippingAddress = null;
    if (
      populatedOrder.shippingAddressId &&
      mongoose.Types.ObjectId.isValid(populatedOrder.shippingAddressId)
    ) {
      const partnerAddress = await PartnerAddress.findOne({
        partnerId,
        "addressDetail._id": populatedOrder.shippingAddressId,
      });
      if (partnerAddress) {
        const matchedAddress = partnerAddress.addressDetail.find(
          (addr) =>
            addr._id.toString() === populatedOrder.shippingAddressId.toString()
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

    populatedOrder.orderProductDetails = await Promise.all(
      populatedOrder.orderProductDetails.map(async (detail) => {
        const enrichedOrderDetails = await Promise.all(
          detail.orderDetails.map(async (subDetail) => {
            let image = null;
            try {
              const itemDetail = await ItemDetail.findOne({
                itemId: detail.itemId._id,
              });
              console.log(
                `[populateOrderDetails] ItemDetail for itemId ${detail.itemId._id}:`,
                itemDetail ? "Found" : "Not found"
              );
              if (!itemDetail) {
                console.warn(
                  `[populateOrderDetails] No ItemDetail for itemId ${detail.itemId._id}, using default image`
                );
                populatedOrder.warnings = populatedOrder.warnings || [];
                populatedOrder.warnings.push(
                  `No ItemDetail found for itemId ${detail.itemId._id}`
                );
              } else {
                const colorEntry = itemDetail.imagesByColor.find(
                  (entry) =>
                    entry.color.toLowerCase() === subDetail.color.toLowerCase()
                );
                console.log(
                  `[populateOrderDetails] Color ${subDetail.color} for itemId ${detail.itemId._id}:`,
                  colorEntry ? "Found" : "Not found"
                );
                if (!colorEntry) {
                  console.warn(
                    `[populateOrderDetails] No color ${subDetail.color} in ItemDetail for itemId ${detail.itemId._id}`
                  );
                  populatedOrder.warnings = populatedOrder.warnings || [];
                  populatedOrder.warnings.push(
                    `No color ${subDetail.color} found in ItemDetail for itemId ${detail.itemId._id}`
                  );
                } else {
                  const sizeEntry = colorEntry.sizes.find((s) =>
                    subDetail.sizeAndQuantity.some(
                      (sizeQty) =>
                        sizeQty.size.toLowerCase() === s.size.toLowerCase() &&
                        sizeQty.skuId === s.skuId
                    )
                  );
                  console.log(
                    `[populateOrderDetails] Size and SKU for color ${subDetail.color}:`,
                    sizeEntry ? "Found" : "Not found"
                  );
                  if (!sizeEntry) {
                    console.warn(
                      `[populateOrderDetails] No matching size/SKU for color ${subDetail.color} in ItemDetail for itemId ${detail.itemId._id}`
                    );
                    populatedOrder.warnings = populatedOrder.warnings || [];
                    populatedOrder.warnings.push(
                      `No matching size/SKU for color ${subDetail.color} in ItemDetail for itemId ${detail.itemId._id}`
                    );
                  } else if (
                    !colorEntry.images ||
                    colorEntry.images.length === 0 ||
                    !colorEntry.images[0].url
                  ) {
                    console.warn(
                      `[populateOrderDetails] No images for color ${subDetail.color} in ItemDetail for itemId ${detail.itemId._id}`
                    );
                    populatedOrder.warnings = populatedOrder.warnings || [];
                    populatedOrder.warnings.push(
                      `No images for color ${subDetail.color} in ItemDetail for itemId ${detail.itemId._id}`
                    );
                  } else {
                    const sortedImages = colorEntry.images.sort(
                      (a, b) => (a.priority || 0) - (b.priority || 0)
                    );
                    image = sortedImages[0].url;
                    console.log(
                      `[populateOrderDetails] Image for color ${subDetail.color}:`,
                      image
                    );
                  }
                }
              }
              // Fallback to default item image
              if (!image && detail.itemId.image) {
                image = detail.itemId.image;
                console.log(
                  `[populateOrderDetails] Using default image for itemId ${detail.itemId._id}:`,
                  image
                );
              }
            } catch (error) {
              console.error(
                `[populateOrderDetails] Error fetching image for itemId ${detail.itemId._id}, color ${subDetail.color}:`,
                error.message
              );
              populatedOrder.warnings = populatedOrder.warnings || [];
              populatedOrder.warnings.push(
                `Failed to fetch image for itemId ${detail.itemId._id}, color ${subDetail.color}: ${error.message}`
              );
              if (detail.itemId.image) {
                image = detail.itemId.image;
                console.log(
                  `[populateOrderDetails] Using default image on error for itemId ${detail.itemId._id}:`,
                  image
                );
              }
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
            image: detail.itemId.image, // Ensure image is included
          },
          orderDetails: enrichedOrderDetails,
        };
      })
    );

    populatedOrder.shippingAddress = shippingAddress;

    let pickupLocation = null;
    if (
      populatedOrder.returnInfo &&
      populatedOrder.returnInfo.pickupLocationId &&
      mongoose.Types.ObjectId.isValid(populatedOrder.returnInfo.pickupLocationId)
    ) {
      try {
        const partnerAddress = await PartnerAddress.findOne({
          partnerId,
          "addressDetail._id": populatedOrder.returnInfo.pickupLocationId,
        });
        if (partnerAddress) {
          const matchedAddress = partnerAddress.addressDetail.find(
            (addr) =>
              addr._id.toString() ===
              populatedOrder.returnInfo.pickupLocationId.toString()
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
          `[populateOrderDetails] Error fetching pickupLocationId ${populatedOrder.returnInfo.pickupLocationId} for order ${populatedOrder.orderId}:`,
          error.message
        );
        populatedOrder.warnings = populatedOrder.warnings || [];
        populatedOrder.warnings.push(
          `Failed to fetch pickup location for order ${populatedOrder.orderId}`
        );
      }
    }

    return populatedOrder;
  } catch (error) {
    console.error("[populateOrderDetails] Error populating order details:", error);
    throw error;
  }
};

// Retry helper for PhonePe API calls
const withRetry = async (
  operation,
  maxRetries = 3,
  baseDelay = 1000,
  requestId
) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("PhonePe API timeout")), 10000)
        ),
      ]);
    } catch (error) {
      console.log(
        `[${new Date().toISOString()}] [RequestID: ${requestId}] Attempt ${attempt} failed: ${
          error.message
        }`
      );
      if (attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};



// Controller to create a new PartnerOrder document
exports.createPartnerOrder = async (req, res) => {
  // Start a MongoDB session for transaction management
  const session = await mongoose.startSession();
  session.startTransaction();
  // Generate a unique request ID for logging
  const requestId = randomUUID();

  try {
    // Log the start of order creation
    console.log(
      `[${new Date().toISOString()}] [RequestID: ${requestId}] Creating partner order`
    );

    // Extract partnerId from authenticated user
    const { partnerId } = req.user;

    // Validate partnerId presence
    if (!partnerId) {
      throw new Error("Unauthorized: Partner ID not found in request");
    }

    // Validate partnerId format
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      throw new Error("Invalid partnerId format");
    }

    // Verify partner exists in database
    const partner = await Partner.findById(partnerId).session(session);
    if (!partner) {
      throw new Error("Partner not found");
    }

    // Destructure request body
    let {
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

    // Convert FormData strings to appropriate types
    totalAmount = Number(totalAmount);
    walletAmountUsed = Number(walletAmountUsed);
    isWalletPayment = isWalletPayment === "true" || isWalletPayment === true;
    isOnlinePayment = isOnlinePayment === "true" || isOnlinePayment === true;
    isCodPayment = isCodPayment === "true" || isCodPayment === true;
    isChequePayment = isChequePayment === "true" || isChequePayment === true;

    // Parse orderProductDetails if sent as a string (FormData)
    if (typeof orderProductDetails === "string") {
      try {
        orderProductDetails = JSON.parse(orderProductDetails);
      } catch (e) {
        throw new Error("Invalid orderProductDetails format: must be a valid JSON array");
      }
    }

    // Parse invoice if sent as a string (FormData)
    if (typeof invoice === "string") {
      try {
        invoice = JSON.parse(invoice);
      } catch (e) {
        throw new Error("Invalid invoice format: must be a valid JSON array");
      }
    }

    // Log parsed request body for debugging
    console.log(
      `[${new Date().toISOString()}] [RequestID: ${requestId}] Parsed req.body:`,
      JSON.stringify({ orderProductDetails, invoice, totalAmount, isWalletPayment, isOnlinePayment, isCodPayment, isChequePayment, walletAmountUsed }, null, 2)
    );

    // Validate required fields
    if (!orderProductDetails || !totalAmount || !shippingAddressId) {
      throw new Error("orderProductDetails, shippingAddressId, and totalAmount are required");
    }

    // Validate invoice is a non-empty array
    if (!invoice || !Array.isArray(invoice) || invoice.length === 0) {
      throw new Error("Invoice must be a non-empty array");
    }

    // Validate each invoice entry
    for (const inv of invoice) {
      if (
        !inv.key ||
        typeof inv.key !== "string" ||
        inv.key.trim() === "" ||
        !inv.values ||
        typeof inv.values !== "string" ||
        inv.values.trim() === ""
      ) {
        throw new Error("Each invoice entry must have a non-empty key and values");
      }
    }

    // Fetch partner's cart
    const cart = await PartnerCart.findOne({ partnerId }).session(session);
    // Validate cart exists and has items
    if (!cart || !cart.items || cart.items.length === 0) {
      throw new Error("Cart is empty or not found");
    }
    // Log cart items for debugging
    console.log(
      `[${new Date().toISOString()}] [RequestID: ${requestId}] Cart items:`,
      JSON.stringify(cart.items, null, 2)
    );

    // Validate orderProductDetails is a non-empty array
    if (!Array.isArray(orderProductDetails) || orderProductDetails.length === 0) {
      throw new Error("orderProductDetails must be a non-empty array");
    }

    // Validate totalQuantity and totalPrice against cart
    for (const orderDetail of orderProductDetails) {
      // Check itemId format
      if (!mongoose.Types.ObjectId.isValid(orderDetail.itemId)) {
        throw new Error("Invalid itemId format in orderProductDetails");
      }
      // Find matching cart item
      const cartItem = cart.items.find(
        (item) => item.itemId.toString() === orderDetail.itemId.toString()
      );
      if (!cartItem) {
        throw new Error(`Item with itemId ${orderDetail.itemId} not found in cart`);
      }
      // Log cart item details
      console.log(
        `[${new Date().toISOString()}] [RequestID: ${requestId}] Cart item ${orderDetail.itemId}: totalQuantity=${cartItem.totalQuantity}, totalPrice=${cartItem.totalPrice}`
      );

      // Compare totalQuantity
      if (cartItem.totalQuantity !== orderDetail.totalQuantity) {
        return res.status(400).json(
          apiResponse(
            400,
            false,
            `Cart total quantity is ${cartItem.totalQuantity} and that received is ${orderDetail.totalQuantity} for itemId ${orderDetail.itemId}`
          )
        );
      }
      // Compare totalPrice
      if (cartItem.totalPrice !== orderDetail.totalPrice) {
        return res.status(400).json(
          apiResponse(
            400,
            false,
            `Cart total price is ${cartItem.totalPrice} and that received is ${orderDetail.totalPrice} for itemId ${orderDetail.itemId}`
          )
        );
      }
    }

    // Validate item details and quantities
    for (const orderDetail of orderProductDetails) {
      // Verify item exists
      const itemExists = await Item.findById(orderDetail.itemId).session(session);
      if (!itemExists) {
        throw new Error(`Item not found for itemId: ${orderDetail.itemId}`);
      }
      // Check item has required image
      if (!itemExists.image) {
        throw new Error(`Item ${orderDetail.itemId} is missing required image field`);
      }

      // Validate orderDetails structure
      if (!orderDetail.orderDetails || !Array.isArray(orderDetail.orderDetails)) {
        throw new Error("orderDetails must contain a valid orderDetails array");
      }
      for (const subDetail of orderDetail.orderDetails) {
        if (subDetail.sizeAndQuantity && Array.isArray(subDetail.sizeAndQuantity)) {
          for (const sizeQty of subDetail.sizeAndQuantity) {
            if (!sizeQty.skuId || sizeQty.quantity < 1) {
              throw new Error("skuId and valid quantity are required in sizeAndQuantity");
            }
          }
        } else {
          throw new Error("sizeAndQuantity must be a non-empty array");
        }
      }

      // Validate totalQuantity within orderDetail
      const calculatedQuantity = orderDetail.orderDetails.reduce(
        (total, subDetail) =>
          total +
          subDetail.sizeAndQuantity.reduce(
            (sum, sizeQty) => sum + sizeQty.quantity,
            0
          ),
        0
      );
      if (orderDetail.totalQuantity !== calculatedQuantity) {
        throw new Error(
          `Total quantity mismatch for itemId ${orderDetail.itemId}: expected ${calculatedQuantity}, got ${orderDetail.totalQuantity}`
        );
      }

      // Validate quantities against cart
      const cartItem = cart.items.find(
        (item) => item.itemId.toString() === orderDetail.itemId.toString()
      );
      for (const orderSubDetail of orderDetail.orderDetails) {
        const cartSubDetail = cartItem.orderDetails.find(
          (sub) => sub.color === orderSubDetail.color
        );
        if (!cartSubDetail) {
          throw new Error(
            `Color ${orderSubDetail.color} not found in cart for itemId ${orderDetail.itemId}`
          );
        }
        for (const orderSizeQty of orderSubDetail.sizeAndQuantity) {
          const cartSizeQty = cartSubDetail.sizeAndQuantity.find(
            (sizeQty) =>
              sizeQty.skuId === orderSizeQty.skuId &&
              sizeQty.size.toLowerCase() === orderSizeQty.size.toLowerCase()
          );
          if (!cartSizeQty) {
            throw new Error(
              `Item with skuId ${orderSizeQty.skuId} and size ${orderSizeQty.size} not found in cart`
            );
          }
          if (cartSizeQty.quantity < orderSizeQty.quantity) {
            throw new Error(
              `Insufficient quantity for skuId ${orderSizeQty.skuId} in cart`
            );
          }
        }
      }
    }

    // Validate shippingAddressId format
    if (!mongoose.Types.ObjectId.isValid(shippingAddressId)) {
      throw new Error("Invalid shippingAddressId format");
    }
    // Verify shipping address exists
    const addressExists = await PartnerAddress.findOne({
      partnerId,
      "addressDetail._id": shippingAddressId,
    }).session(session);
    if (!addressExists) {
      throw new Error("Shipping address not found");
    }

    // Validate payment methods
    const activeMethodsCount = [
      isWalletPayment,
      isOnlinePayment,
      isCodPayment,
      isChequePayment,
    ].filter(Boolean).length;
    if (activeMethodsCount === 0) {
      throw new Error("At least one payment method must be selected");
    }
    if (
      activeMethodsCount > 2 ||
      (activeMethodsCount === 2 && !isWalletPayment)
    ) {
      throw new Error(
        "Invalid payment method combination; only wallet can be combined with one of online, cod, or cheque"
      );
    }

    // Generate unique order ID
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Initialize payment variables
    let walletAmountUsedFinal = walletAmountUsed;
    let onlineAmount = 0;
    let codAmount = 0;
    let chequeAmount = 0;
    let phonepeOrderId = null;
    let phonepeMerchantOrderId = null;
    let checkoutPageUrl = null;
    let finalOrderStatus = "In transit";
    let paymentStatus = "Pending";
    let isOrderPlaced = true;

    // Validate wallet balance for all wallet-related cases
    if (isWalletPayment) {
      const wallet = await Wallet.findOne({ partnerId }).session(session);
      if (!wallet) {
        throw new Error("Wallet not found for partner");
      }
      const partnerWalletAmount = wallet.totalBalance || 0;
      if (walletAmountUsed > partnerWalletAmount) {
        throw new Error("Insufficient wallet balance");
      }
      if (walletAmountUsed <= 0) {
        throw new Error("walletAmountUsed must be greater than 0 when isWalletPayment is true");
      }
      if (walletAmountUsed > totalAmount) {
        throw new Error("walletAmountUsed cannot exceed totalAmount");
      }
    }

    // Handle payment methods
    if (isWalletPayment) {
      const wallet = await Wallet.findOne({ partnerId }).session(session);
      // Handle wallet + online
      if (isOnlinePayment && !isCodPayment && !isChequePayment) {
        onlineAmount = totalAmount - walletAmountUsed;
        if (onlineAmount <= 0) {
          throw new Error("Online amount must be greater than 0");
        }
        const merchantOrderId = randomUUID();
        const request = StandardCheckoutPayRequest.builder()
          .merchantOrderId(merchantOrderId)
          .amount(onlineAmount * 100)
          .redirectUrl(
            process.env.PHONEPE_REDIRECT_URL || "https://your-merchant.com/redirect"
          )
          .build();
        const response = await withRetry(
          () => phonepeClient.initiatePayment(request),
          3,
          1000,
          requestId
        );
        phonepeOrderId = response.orderId;
        phonepeMerchantOrderId = merchantOrderId;
        checkoutPageUrl = response.redirectUrl;

        // Verify PhonePe payment
        const paymentStatusResponse = await phonepeClient.verifyPayment(phonepeOrderId);
        if (paymentStatusResponse.success && paymentStatusResponse.data.state === "COMPLETED") {
          paymentStatus = "Paid";
          finalOrderStatus = "Confirmed";
          isOrderPlaced = true;
        } else {
          throw new Error("PhonePe payment verification failed");
        }

        // Update wallet
        wallet.totalBalance -= walletAmountUsed;
        wallet.transactions.push({
          type: "debit",
          amount: walletAmountUsed,
          description: `Payment for order ${orderId}`,
          orderId,
          status: "completed",
          createdAt: new Date(),
        });
        await wallet.save({ session });
      }
      // Handle wallet + COD
      else if (isCodPayment && !isOnlinePayment && !isChequePayment) {
        codAmount = totalAmount - walletAmountUsed;
        if (codAmount <= 0) {
          throw new Error("COD amount must be greater than 0");
        }
        paymentStatus = "Pending";
        finalOrderStatus = "In transit";
        isOrderPlaced = true;

        // Update wallet
        wallet.totalBalance -= walletAmountUsed;
        wallet.transactions.push({
          type: "debit",
          amount: walletAmountUsed,
          description: `Payment for order ${orderId}`,
          orderId,
          status: "completed",
          createdAt: new Date(),
        });
        await wallet.save({ session });
      }
      // Handle wallet + cheque
      else if (isChequePayment && !isOnlinePayment && !isCodPayment) {
        if (!req.file) {
          throw new Error("Cheque image file is required for cheque payment");
        }
        chequeAmount = totalAmount - walletAmountUsed;
        if (chequeAmount <= 0) {
          throw new Error("Cheque amount must be greater than 0");
        }
        paymentStatus = "Pending";
        finalOrderStatus = "In transit";
        isOrderPlaced = true;

        // Update wallet
        wallet.totalBalance -= walletAmountUsed;
        wallet.transactions.push({
          type: "debit",
          amount: walletAmountUsed,
          description: `Payment for order ${orderId}`,
          orderId,
          status: "completed",
          createdAt: new Date(),
        });
        await wallet.save({ session });
      }
      // Handle wallet only
      else if (!isOnlinePayment && !isCodPayment && !isChequePayment) {
        if (walletAmountUsed < totalAmount) {
          throw new Error("Insufficient wallet amount; totalAmount must equal walletAmountUsed");
        }
        walletAmountUsedFinal = totalAmount;
        paymentStatus = "Paid";
        finalOrderStatus = "Confirmed";
        isOrderPlaced = true;

        // Update wallet
        wallet.totalBalance -= walletAmountUsedFinal;
        wallet.transactions.push({
          type: "debit",
          amount: walletAmountUsedFinal,
          description: `Payment for order ${orderId}`,
          orderId,
          status: "completed",
          createdAt: new Date(),
        });
        await wallet.save({ session });
      } else {
        throw new Error("Invalid payment method combination with wallet");
      }
    } else {
      // Handle COD only
      if (isCodPayment && !isOnlinePayment && !isChequePayment) {
        codAmount = totalAmount;
        paymentStatus = "Pending";
        finalOrderStatus = "In transit";
        isOrderPlaced = true;
      }
      // Handle cheque only
      else if (isChequePayment && !isOnlinePayment && !isCodPayment) {
        if (!req.file) {
          throw new Error("Cheque image file is required for cheque payment");
        }
        chequeAmount = totalAmount;
        paymentStatus = "Pending";
        finalOrderStatus = "In transit";
        isOrderPlaced = true;
      }
      // Handle online only
      else if (isOnlinePayment && !isCodPayment && !isChequePayment) {
        onlineAmount = totalAmount;
        const merchantOrderId = randomUUID();
        const request = StandardCheckoutPayRequest.builder()
          .merchantOrderId(merchantOrderId)
          .amount(onlineAmount * 100)
          .redirectUrl(
            process.env.PHONEPE_REDIRECT_URL || "https://your-merchant.com/redirect"
          )
          .build();
        const response = await withRetry(
          () => phonepeClient.initiatePayment(request),
          3,
          1000,
          requestId
        );
        phonepeOrderId = response.orderId;
        phonepeMerchantOrderId = merchantOrderId;
        checkoutPageUrl = response.redirectUrl;

        // Verify PhonePe payment
        const paymentStatusResponse = await phonepeClient.verifyPayment(phonepeOrderId);
        if (paymentStatusResponse.success && paymentStatusResponse.data.state === "COMPLETED") {
          paymentStatus = "Paid";
          finalOrderStatus = "Confirmed";
          isOrderPlaced = true;
        } else {
          throw new Error("PhonePe payment verification failed");
        }
      } else {
        throw new Error(
          "Invalid payment method combination; select one of online, cod, or cheque when wallet is not used"
        );
      }
    }

    // Log payment details for debugging
    console.log(
      `[${new Date().toISOString()}] [RequestID: ${requestId}] Payment details: ` +
      `wallet=${walletAmountUsedFinal}, online=${onlineAmount}, cod=${codAmount}, ` +
      `cheque=${chequeAmount}, totalAmount=${totalAmount}, calculatedTotal=${walletAmountUsedFinal + onlineAmount + codAmount + chequeAmount}`
    );

    // Validate total amount matches payment methods
    const calculatedTotal = walletAmountUsedFinal + onlineAmount + codAmount + chequeAmount;
    if (calculatedTotal !== totalAmount) {
      throw new Error(
        `Total amount must equal the sum of wallet, online, cod, and cheque amounts: calculated=${calculatedTotal}, provided=${totalAmount}`
      );
    }

    // Upload cheque image if provided
    let url = null;
    if (req.file) {
      url = await uploadImageToS3(
        req.file,
        `Nanocart/Partner/${partnerId}/order/${orderId}/chequeImage`
      );
    }

    // Create new order document
    const newOrder = new PartnerOrder({
      orderId,
      partnerId,
      orderProductDetails,
      shippingAddressId,
      totalAmount,
      invoice,
      chequeImages: { url },
      phonepeOrderId,
      phonepeMerchantOrderId,
      checkoutPageUrl,
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
      isOrderPlaced,
      deliveredAt: finalOrderStatus === "Delivered" ? new Date() : undefined,
    });

    // Save order to database
    await newOrder.save({ session });

    // Update cart by reducing quantities
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
            for (const orderSizeQty of orderSubDetail.sizeAndQuantity) {
              const cartSizeQty = cartSubDetail.sizeAndQuantity.find(
                (sizeQty) =>
                  sizeQty.skuId === orderSizeQty.skuId &&
                  sizeQty.size.toLowerCase() === orderSizeQty.size.toLowerCase()
              );
              if (cartSizeQty) {
                cartSizeQty.quantity -= orderSizeQty.quantity;
              }
            }
            // Remove sizes with zero quantity
            cartSubDetail.sizeAndQuantity = cartSubDetail.sizeAndQuantity.filter(
              (sizeQty) => sizeQty.quantity > 0
            );
          }
        }
        // Remove colors with no sizes
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
        // Set totalPrice to 0 if no items remain
        cartItem.totalPrice = cartItem.totalQuantity === 0 ? 0 : cartItem.totalPrice;
      }
    }
    // Remove empty items from cart
    cart.items = cart.items.filter((item) => item.orderDetails.length > 0);
    await cart.save({ session });

    // Commit transaction
    await session.commitTransaction();

    // Populate order details for response
    const populatedOrder = await populateOrderDetails(newOrder._id, partnerId);
    populatedOrder.checkoutPageUrl = checkoutPageUrl;

    // Log successful order creation
    console.log(
      `[${new Date().toISOString()}] [RequestID: ${requestId}] PartnerOrder created successfully: ${orderId}`
    );

    // Return success response
    return res
      .status(201)
      .json(
        apiResponse(201, true, "PartnerOrder created successfully", populatedOrder)
      );
  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    // Log error
    console.error(
      `[${new Date().toISOString()}] [RequestID: ${requestId}] Error creating partner order: ${
        error.message
      }`
    );
    // Return error response
    return res
      .status(error.status || 500)
      .json(
        apiResponse(
          error.status || 500,
          false,
          error.message || "An error occurred while creating partner order"
        )
      );
  } finally {
    // End session
    session.endSession();
  }
};



// Controller to handle return and refund
exports.requestReturnAndRefund = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const requestId = randomUUID();

  try {
    console.log(
      `[${new Date().toISOString()}] [RequestID: ${requestId}] Processing return and refund`
    );
    const { partnerId } = req.user;

    if (!partnerId) {
      throw new Error("Unauthorized: Partner ID not found in request");
    }

    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      throw new Error("Invalid partnerId format");
    }

    const { orderId, reason, pickupLocationId } = req.body;

    if (!orderId || !reason || !pickupLocationId) {
      throw new Error("orderId, reason, and pickupLocationId are required");
    }

    if (typeof reason !== "string" || reason.trim() === "") {
      throw new Error("Reason must be a non-empty string");
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new Error("Invalid orderId format");
    }

    const order = await PartnerOrder.findOne({ _id: orderId, partnerId }).session(
      session
    );
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.isOrderReturned) {
      throw new Error("Order has already been returned");
    }
    if (order.orderStatus !== "Delivered") {
      throw new Error(
        "Order must be in Delivered status to request a return"
      );
    }
    if (!order.isOrderPlaced) {
      throw new Error("Order is not confirmed for return");
    }

    if (order.deliveredAt) {
      const returnWindowDays = 7;
      const currentDate = new Date();
      const maxReturnDate = new Date(order.deliveredAt);
      maxReturnDate.setDate(maxReturnDate.getDate() + returnWindowDays);
      if (currentDate > maxReturnDate) {
        throw new Error("Return request is outside the allowed return window");
      }
    } else {
      throw new Error("Delivery date not set for the order");
    }

    if (order.isCodPayment && order.paymentStatus !== "Paid") {
      throw new Error(
        "COD order payment must be confirmed before requesting a refund"
      );
    }

    if (!mongoose.Types.ObjectId.isValid(pickupLocationId)) {
      throw new Error("Invalid pickupLocationId format");
    }
    const addressExists = await PartnerAddress.findOne({
      partnerId,
      "addressDetail._id": pickupLocationId,
    }).session(session);
    if (!addressExists) {
      throw new Error("Pickup address not found");
    }

    let refundAmount = order.totalAmount;
    if (order.isCodPayment) {
      refundAmount = order.totalAmount - 50;
      if (refundAmount <= 0) {
        throw new Error(
          "Refund amount after COD deduction must be greater than 0"
        );
      }
    }

    const wallet = await Wallet.findOne({ partnerId }).session(session);
    if (!wallet) {
      throw new Error("Wallet not found for partner");
    }

    const refundTransactionId = `REF-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const refundStatus = "Initiated";

    order.isOrderReturned = true;
    order.orderStatus = "Order Returned";
    order.returnInfo = {
      reason,
      requestDate: new Date(),
      pickupLocationId,
      refundTransactionId,
      refundAmount,
      refundStatus,
    };
    order.paymentStatus = "Refunded";

    wallet.totalBalance += refundAmount;
    wallet.transactions.push({
      type: "credit",
      amount: refundAmount,
      description: `Refund for order ${order.orderId}`,
      orderId: order.orderId,
      status: "completed",
      createdAt: new Date(),
    });

    await Promise.all([order.save({ session }), wallet.save({ session })]);

    await session.commitTransaction();

    const populatedOrder = await populateOrderDetails(order._id, partnerId);

    console.log(
      `[${new Date().toISOString()}] [RequestID: ${requestId}] Return and refund processed: ${orderId}`
    );
    return res
      .status(200)
      .json(
        apiResponse(
          200,
          true,
          "Return and refund request processed successfully",
          populatedOrder
        )
      );
  } catch (error) {
    await session.abortTransaction();
    console.error(
      `[${new Date().toISOString()}] [RequestID: ${requestId}] Error processing return and refund: ${
        error.message
      }`
    );
    return res
      .status(error.status || 500)
      .json(
        apiResponse(
          error.status || 500,
          false,
          error.message || "An error occurred while processing return and refund"
        )
      );
  } finally {
    session.endSession();
  }
};

// Controller to fetch all PartnerOrders for a partner
exports.fetchAllPartnerOrders = async (req, res) => {
  try {
    const { partnerId } = req.user;

    if (!partnerId) {
      return res
        .status(401)
        .json(
          apiResponse(
            401,
            false,
            "Unauthorized: Partner ID not found in request"
          )
        );
    }

    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Invalid partnerId format"));
    }

    const orders = await PartnerOrder.find({ partnerId })
      .sort({ createdAt: -1 })
      .lean();

    const populatedOrders = await Promise.all(
      orders.map(async (order) => {
        try {
          return await populateOrderDetails(order._id, partnerId);
        } catch (error) {
          console.error(`Error populating order ${order._id}:`, error.message);
          return {
            ...order,
            warnings: [`Failed to populate order details: ${error.message}`],
          };
        }
      })
    );

    const orderSummaries = populatedOrders.map((order) => {
      const itemNames = order.orderProductDetails
        ? order.orderProductDetails.map((detail) =>
            detail.itemId && detail.itemId.name ? detail.itemId.name : "Unknown Item"
          )
        : [];
      return {
        orderId: order.orderId || order._id,
        orderDate: order.createdAt,
        numberOfItems: order.orderProductDetails
          ? order.orderProductDetails.length
          : 0,
        itemNames,
      };
    });

    return res
      .status(200)
      .json(
        apiResponse(200, true, "All PartnerOrders fetched successfully", {
          orders: populatedOrders,
          orderSummaries,
        })
      );
  } catch (error) {
    console.error("Error fetching all partner orders:", error);
    return res
      .status(500)
      .json(
        apiResponse(
          500,
          false,
          "An error occurred while fetching all partner orders"
        )
      );
  }
};