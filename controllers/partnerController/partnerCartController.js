const mongoose = require("mongoose");
const PartnerCart = require("../../models/Partner/PartnerCart");
const Partner = require("../../models/Partner/Partner");
const Item = require("../../models/Items/Item");
const ItemDetail = require("../../models/Items/ItemDetail");
const { apiResponse } = require("../../utils/apiResponse");


// // Controller to add or update items in PartnerCart
// exports.addToCart = async (req, res) => {
//   try {
//     const { partnerId } = req.user;
//     const { itemId, orderDetails } = req.body;

//     // Validate input
//     if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
//       throw new Error("Invalid or missing partnerId");
//     }
//     if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
//       throw new Error("Invalid or missing itemId");
//     }
//     if (!orderDetails || !Array.isArray(orderDetails) || orderDetails.length === 0) {
//       throw new Error("orderDetails must be a non-empty array");
//     }

//     // Validate orderDetails structure
//     for (const detail of orderDetails) {
//       if (!detail.color || typeof detail.color !== "string") {
//         throw new Error("Each orderDetails entry must have a valid color");
//       }
//       if (
//         !detail.sizeAndQuantity ||
//         !Array.isArray(detail.sizeAndQuantity) ||
//         detail.sizeAndQuantity.length === 0
//       ) {
//         throw new Error("sizeAndQuantity must be a non-empty array");
//       }
//       for (const sizeQty of detail.sizeAndQuantity) {
//         if (
//           !sizeQty.size ||
//           typeof sizeQty.size !== "string" ||
//           !sizeQty.quantity ||
//           sizeQty.quantity < 1 ||
//           !sizeQty.skuId ||
//           typeof sizeQty.skuId !== "string"
//         ) {
//           throw new Error(
//             "Each sizeAndQuantity entry must have valid size, quantity, and skuId"
//           );
//         }
//       }
//     }

//     // Verify Item exists
//     const item = await Item.findById(itemId);
//     if (!item) {
//       throw new Error(`Item not found for itemId: ${itemId}`);
//     }

//     // Fetch ItemDetail to get PPQ for pricing
//     const itemDetail = await ItemDetail.findOne({ itemId });
//     if (!itemDetail) {
//       throw new Error(`ItemDetail not found for itemId: ${itemId}`);
//     }

//     // Calculate totalQuantity and totalPrice
//     let totalQuantity = 0;
//     let totalPrice = 0;

//     for (const detail of orderDetails) {
//       for (const sizeQty of detail.sizeAndQuantity) {
//         totalQuantity += sizeQty.quantity;

//         // Find the matching size in ItemDetail
//         const colorEntry = itemDetail.imagesByColor.find(
//           (entry) => entry.color === detail.color
//         );
//         if (!colorEntry) {
//           throw new Error(`Color ${detail.color} not found in ItemDetail for itemId: ${itemId}`);
//         }

//         const sizeEntry = colorEntry.sizes.find(
//           (size) => size.size === sizeQty.size
//         );
//         if (!sizeEntry) {
//           throw new Error(`Size ${sizeQty.size} not found for color ${detail.color} in itemId: ${itemId}`);
//         }

//         // Find the appropriate PPQ price
//         const ppqEntry = itemDetail.PPQ.find(
//           (ppq) => sizeQty.quantity >= ppq.minQty && (!ppq.maxQty || sizeQty.quantity <= ppq.maxQty)
//         );
//         if (!ppqEntry) {
//           throw new Error(
//             `No valid PPQ range found for quantity ${sizeQty.quantity} in itemId: ${itemId}`
//           );
//         }

//         totalPrice += sizeQty.quantity * ppqEntry.pricePerUnit;
//       }
//     }

//     // Find or create cart
//     let cart = await PartnerCart.findOne({ partnerId });
//     if (!cart) {
//       cart = new PartnerCart({ partnerId, items: [] });
//     }

//     // Check if item already exists in cart
//     const existingItemIndex = cart.items.findIndex(
//       (item) => item.itemId.toString() === itemId.toString()
//     );

//     if (existingItemIndex !== -1) {
//       // Update existing item
//       cart.items[existingItemIndex] = {
//         itemId,
//         orderDetails,
//         totalQuantity,
//         totalPrice,
//         addedAt: new Date(),
//       };
//     } else {
//       // Add new item
//       cart.items.push({
//         itemId,
//         orderDetails,
//         totalQuantity,
//         totalPrice,
//         addedAt: new Date(),
//       });
//     }

//     await cart.save();

//     return res
//       .status(200)
//       .json(apiResponse(200, true, "Item added to cart successfully", cart));
//   } catch (error) {
//     return res
//       .status(error.status || 500)
//       .json(apiResponse(error.status || 500, false, error.message));
//   }
// };


exports.addToCart = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { itemId, orderDetails } = req.body;

    // Validate input
    if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
      throw new Error("Invalid or missing partnerId");
    }
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      throw new Error("Invalid or missing itemId");
    }
    if (!orderDetails || !Array.isArray(orderDetails) || orderDetails.length === 0) {
      throw new Error("orderDetails must be a non-empty array");
    }

    // Validate orderDetails structure
    for (const detail of orderDetails) {
      if (!detail.color || typeof detail.color !== "string") {
        throw new Error("Each orderDetails entry must have a valid color");
      }
      if (
        !detail.sizeAndQuantity ||
        !Array.isArray(detail.sizeAndQuantity) ||
        detail.sizeAndQuantity.length === 0
      ) {
        throw new Error("sizeAndQuantity must be a non-empty array");
      }
      for (const sizeQty of detail.sizeAndQuantity) {
        if (
          !sizeQty.size ||
          typeof sizeQty.size !== "string" ||
          !sizeQty.quantity ||
          sizeQty.quantity < 1 ||
          !sizeQty.skuId ||
          typeof sizeQty.skuId !== "string"
        ) {
          throw new Error(
            "Each sizeAndQuantity entry must have valid size, quantity, and skuId"
          );
        }
      }
    }

    // Verify Item exists
    const item = await Item.findById(itemId);
    if (!item) {
      throw new Error(`Item not found for itemId: ${itemId}`);
    }

    // Fetch ItemDetail to get PPQ for pricing and check stock
    const itemDetail = await ItemDetail.findOne({ itemId });
    if (!itemDetail) {
      throw new Error(`ItemDetail not found for itemId: ${itemId}`);
    }

    // Calculate totalQuantity and totalPrice, and check stock availability
    let totalQuantity = 0;
    let totalPrice = 0;

    for (const detail of orderDetails) {
      const colorEntry = itemDetail.imagesByColor.find(
        (entry) => entry.color === detail.color
      );
      if (!colorEntry) {
        throw new Error(`Color ${detail.color} not found in ItemDetail for itemId: ${itemId}`);
      }

      for (const sizeQty of detail.sizeAndQuantity) {
        totalQuantity += sizeQty.quantity;

        // Find the matching size in ItemDetail
        const sizeEntry = colorEntry.sizes.find(
          (size) => size.size === sizeQty.size && size.skuId === sizeQty.skuId
        );
        if (!sizeEntry) {
          throw new Error(`Size ${sizeQty.size} with skuId ${sizeQty.skuId} not found for color ${detail.color} in itemId: ${itemId}`);
        }

        // Check stock availability
        if (sizeEntry.stock < sizeQty.quantity) {
          throw new Error(
            `Insufficient stock for size ${sizeQty.size} (skuId: ${sizeQty.skuId}) in color ${detail.color} for itemId: ${itemId}. Available: ${sizeEntry.stock}, Requested: ${sizeQty.quantity}`
          );
        }

        // Find the appropriate PPQ price
        const ppqEntry = itemDetail.PPQ.find(
          (ppq) => sizeQty.quantity >= ppq.minQty && (!ppq.maxQty || sizeQty.quantity <= ppq.maxQty)
        );
        if (!ppqEntry) {
          throw new Error(
            `No valid PPQ range found for quantity ${sizeQty.quantity} in itemId: ${itemId}`
          );
        }

        totalPrice += sizeQty.quantity * ppqEntry.pricePerUnit;
      }
    }

    // Find or create cart
    let cart = await PartnerCart.findOne({ partnerId });
    if (!cart) {
      cart = new PartnerCart({ partnerId, items: [] });
    }

    // Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex(
      (item) => item.itemId.toString() === itemId.toString()
    );

    if (existingItemIndex !== -1) {
      // Update existing item
      cart.items[existingItemIndex] = {
        itemId,
        orderDetails,
        totalQuantity,
        totalPrice,
        addedAt: new Date(),
      };
    } else {
      // Add new item
      cart.items.push({
        itemId,
        orderDetails,
        totalQuantity,
        totalPrice,
        addedAt: new Date(),
      });
    }

    await cart.save();

    return res
      .status(200)
      .json(apiResponse(200, true, "Item added to cart successfully", cart));
  } catch (error) {
    return res
      .status(error.status || 500)
      .json(apiResponse(error.status || 500, false, error.message));
  }
};

// Remove Item Variant from Cart (remove by itemId only)
exports.removeItemFromCart = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { itemId } = req.body;

    // Validate inputs
    if (!itemId) {
      return res.status(400).json(apiResponse(400, false, "itemId is required"));
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemId"));
    }

    // Find cart
    const cart = await PartnerCart.findOne({ partnerId });
    if (!cart) {
      return res.status(404).json(apiResponse(404, false, "Cart not found"));
    }

    // Find the item row to remove
    const rowIndex = cart.items.findIndex(i => i.itemId.toString() === itemId);
    if (rowIndex < 0) {
      return res.status(404).json(apiResponse(404, false, "Item not in cart"));
    }


    // Remove the item from the cart
    cart.items.splice(rowIndex, 1);


    await cart.save();

    // Fetch updated cart for response
    const result = await PartnerCart.findById(cart._id);

    return res.status(200).json(
      apiResponse(200, true, "Item removed from cart", result)
    );
  } catch (error) {
    console.error("Remove from cart error:", error);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

// Controller to update item quantity by size in PartnerCart
exports.updateItemQuantityBySizeAction = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { itemId, color, size, action } = req.body;

    // Log input parameters
    console.log("Input received:", { itemId, color, size, action });

    // Validate inputs
    if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
      console.log("Validation failed: Invalid or missing partnerId:", partnerId);
      throw new Error("Invalid or missing partnerId");
    }
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      console.log("Validation failed: Invalid or missing itemId:", itemId);
      throw new Error("Invalid or missing itemId");
    }
    if (!color || typeof color !== "string") {
      console.log("Validation failed: Invalid color:", color);
      throw new Error("color must be a valid string");
    }
    if (!size || typeof size !== "string") {
      console.log("Validation failed: Invalid size:", size);
      throw new Error("size must be a valid string");
    }
    if (!action || !["increase", "decrease"].includes(action.toLowerCase())) {
      console.log("Validation failed: Invalid action:", action);
      throw new Error("action must be either 'increase' or 'decrease'");
    }

    // Normalize size to lowercase to match PartnerCart schema
    const normalizedSize = size.toLowerCase();
    console.log("Normalized size:", normalizedSize);

    // Verify Item exists
    console.log("Fetching Item with itemId:", itemId);
    const item = await Item.findById(itemId);
    if (!item) {
      console.log("Item not found for itemId:", itemId);
      throw new Error(`Item not found for itemId: ${itemId}`);
    }

    // Fetch ItemDetail to get PPQ for pricing
    console.log("Fetching ItemDetail for itemId:", itemId);
    const itemDetail = await ItemDetail.findOne({ itemId });
    if (!itemDetail) {
      console.log("ItemDetail not found for itemId:", itemId);
      throw new Error(`ItemDetail not found for itemId: ${itemId}`);
    }
    console.log("ItemDetail imagesByColor:", JSON.stringify(itemDetail.imagesByColor, null, 2));
    console.log("ItemDetail PPQ:", JSON.stringify(itemDetail.PPQ, null, 2));

    // Find cart
    console.log("Fetching PartnerCart for partnerId:", partnerId);
    let cart = await PartnerCart.findOne({ partnerId });
    if (!cart) {
      console.log("Cart not found for partnerId:", partnerId);
      throw new Error("Cart not found");
    }

    // Find the item in cart
    console.log("Searching for itemId in cart:", itemId);
    const itemIndex = cart.items.findIndex(
      (item) => item.itemId.toString() === itemId.toString()
    );
    if (itemIndex === -1) {
      console.log("Item not found in cart for itemId:", itemId);
      throw new Error("Item not found in cart");
    }
    console.log("Item found at index:", itemIndex);

    // Find the orderDetails entry for the specific color
    console.log("Searching for color in orderDetails:", color);
    const orderDetailIndex = cart.items[itemIndex].orderDetails.findIndex(
      (detail) => detail.color.toLowerCase() === color.toLowerCase()
    );
    if (orderDetailIndex === -1) {
      console.log("Color not found in orderDetails:", color);
      console.log("Available colors:", cart.items[itemIndex].orderDetails.map(d => d.color));
      throw new Error(`Color ${color} not found for itemId: ${itemId}`);
    }
    console.log("Color found at orderDetailIndex:", orderDetailIndex);

    // Find the sizeAndQuantity entry for the specific size
    console.log("Searching for size in sizeAndQuantity:", normalizedSize);
    const sizeQtyIndex = cart.items[itemIndex].orderDetails[orderDetailIndex].sizeAndQuantity.findIndex(
      (sizeQty) => sizeQty.size === normalizedSize
    );
    if (sizeQtyIndex === -1) {
      console.log("Size not found in sizeAndQuantity:", normalizedSize);
      console.log("Available sizes for color", color, ":", cart.items[itemIndex].orderDetails[orderDetailIndex].sizeAndQuantity.map(s => s.size));
      throw new Error(`Size ${size} not found for color ${color} in itemId: ${itemId}`);
    }
    console.log("Size found at sizeQtyIndex:", sizeQtyIndex);

    // Update quantity based on action
    const currentQuantity = cart.items[itemIndex].orderDetails[orderDetailIndex].sizeAndQuantity[sizeQtyIndex].quantity;
    console.log("Current quantity for size", normalizedSize, ":", currentQuantity);
    if (action.toLowerCase() === "increase") {
      cart.items[itemIndex].orderDetails[orderDetailIndex].sizeAndQuantity[sizeQtyIndex].quantity += 1;
      console.log("Increased quantity to:", cart.items[itemIndex].orderDetails[orderDetailIndex].sizeAndQuantity[sizeQtyIndex].quantity);
    } else {
      if (currentQuantity <= 1) {
        console.log("Cannot decrease quantity below 1 for size:", normalizedSize);
        throw new Error("Quantity cannot be decreased below 1");
      }
      cart.items[itemIndex].orderDetails[orderDetailIndex].sizeAndQuantity[sizeQtyIndex].quantity -= 1;
      console.log("Decreased quantity to:", cart.items[itemIndex].orderDetails[orderDetailIndex].sizeAndQuantity[sizeQtyIndex].quantity);
    }

    // Recalculate totalQuantity and totalPrice
    let totalQuantity = 0;
    let totalPrice = 0;

    console.log("Recalculating totalQuantity and totalPrice");
    for (const detail of cart.items[itemIndex].orderDetails) {
      for (const sizeQty of detail.sizeAndQuantity) {
        totalQuantity += sizeQty.quantity;

        // Find the matching size in ItemDetail
        console.log("Checking ItemDetail for color:", detail.color);
        const colorEntry = itemDetail.imagesByColor.find(
          (entry) => entry.color.toLowerCase() === detail.color.toLowerCase()
        );
        if (!colorEntry) {
          console.log("Color not found in ItemDetail:", detail.color);
          console.log("Available colors in ItemDetail:", itemDetail.imagesByColor.map(c => c.color));
          throw new Error(`Color ${detail.color} not found in ItemDetail for itemId: ${itemId}`);
        }

        console.log("Checking size in ItemDetail for color", detail.color, ":", sizeQty.size);
        const sizeEntry = colorEntry.sizes.find(
          (sizeEntry) => sizeEntry.size.toLowerCase() === sizeQty.size
        );
        if (!sizeEntry) {
          console.log("Size not found in ItemDetail:", sizeQty.size);
          console.log("Available sizes for color", detail.color, ":", colorEntry.sizes.map(s => s.size));
          throw new Error(`Size ${sizeQty.size} not found for color ${detail.color} in itemId: ${itemId}`);
        }

        // Find the appropriate PPQ price
        console.log("Finding PPQ for quantity:", sizeQty.quantity);
        const ppqEntry = itemDetail.PPQ.find(
          (ppq) => sizeQty.quantity >= ppq.minQty && (!ppq.maxQty || sizeQty.quantity <= ppq.maxQty)
        );
        if (!ppqEntry) {
          console.log("No valid PPQ found for quantity:", sizeQty.quantity);
          console.log("Available PPQ ranges:", JSON.stringify(itemDetail.PPQ, null, 2));
          throw new Error(
            `No valid PPQ range found for quantity ${sizeQty.quantity} in itemId: ${itemId}`
          );
        }
        console.log("PPQ found:", ppqEntry);

        totalPrice += sizeQty.quantity * ppqEntry.pricePerUnit;
      }
    }
    console.log("Calculated totalQuantity:", totalQuantity, "totalPrice:", totalPrice);

    // Update totalQuantity and totalPrice
    cart.items[itemIndex].totalQuantity = totalQuantity;
    cart.items[itemIndex].totalPrice = totalPrice;

    // Update addedAt timestamp
    cart.items[itemIndex].addedAt = new Date();
    console.log("Updated addedAt timestamp:", cart.items[itemIndex].addedAt);

    console.log("Saving updated cart");
    await cart.save();
    console.log("Cart saved successfully");

    return res
      .status(200)
      .json(apiResponse(200, true, `Item quantity ${action} successfully`, cart));
  } catch (error) {
    console.error(`Update item quantity by ${action} error:`, error.message);
    return res
      .status(error.status || 500)
      .json(apiResponse(error.status || 500, false, error.message));
  }
};

exports.getPartnerCart = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const cart = await PartnerCart.findOne({ partnerId }).lean();

    if (!cart || !cart.items.length) {
      return res.status(200).json(apiResponse(200, true, "Cart is empty", { partnerId, items: [] }));
    }

    // Populate all fields of itemId for each item
    const populatedItems = await Promise.all(
      cart.items.map(async (item) => {
        const populatedItem = await Item.findById(item.itemId).lean();
        if (!populatedItem) {
          return null; // Skip if item not found
        }
        return {
          ...item,
          itemId: populatedItem,
        };
      })
    );

    // Filter out null items (in case some items were not found)
    const validItems = populatedItems.filter((item) => item !== null);

    // Construct response data
    const responseData = {
      partnerId,
      items: validItems,
    };

    return res.status(200).json(apiResponse(200, true, "Cart fetched successfully", responseData));
  } catch (error) {
    console.error("Get cart error:", error);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

exports.getPartnerCartByAdmin = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const cart = await PartnerCart.findOne({ partnerId }).lean();

    if (!cart || !cart.items.length) {
      return res.status(200).json(apiResponse(200, true, "Cart is empty", { partnerId, items: [] }));
    }

    // Populate all fields of itemId for each item
    const populatedItems = await Promise.all(
      cart.items.map(async (item) => {
        const populatedItem = await Item.findById(item.itemId).lean();
        if (!populatedItem) {
          return null; // Skip if item not found
        }
        return {
          ...item,
          itemId: populatedItem,
        };
      })
    );

    // Filter out null items (in case some items were not found)
    const validItems = populatedItems.filter((item) => item !== null);

    // Construct response data
    const responseData = {
      partnerId,
      items: validItems,
    };

    return res.status(200).json(apiResponse(200, true, "Cart fetched successfully", responseData));
  } catch (error) {
    console.error("Get cart error:", error);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};