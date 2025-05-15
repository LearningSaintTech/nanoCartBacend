const mongoose = require("mongoose");
const PartnerCart = require("../../models/Partner/PartnerCart");
const Partner = require("../../models/Partner/Partner");
const Item = require("../../models/Items/Item");
const ItemDetail = require("../../models/Items/ItemDetail");
const { apiResponse } = require("../../utils/apiResponse");

// Controller to add or update items in PartnerCart
exports.addToCart = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { itemId, orderDetails, totalQuantity, totalPrice } = req.body;

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
    if (typeof totalQuantity !== "number" || totalQuantity < 1) {
      throw new Error("totalQuantity must be a number greater than 0");
    }
    if (typeof totalPrice !== "number" || totalPrice < 1) {
      throw new Error("totalPrice must be a number greater than 0");
    }

    // Validate orderDetails structure and calculate totalQuantity
    let calculatedQuantity = 0;
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
        calculatedQuantity += sizeQty.quantity;
      }
    }

    // Compare calculated totalQuantity with provided totalQuantity
    if (calculatedQuantity !== totalQuantity) {
      return res.status(400).json(
        apiResponse(
          400,
          false,
          `Total quantity mismatch: calculated ${calculatedQuantity}, received ${totalQuantity} for itemId ${itemId}`
        )
      );
    }

    // Verify Item exists
    const itemExists = await Item.findById(itemId);
    if (!itemExists) {
      throw new Error(`Item not found for itemId: ${itemId}`);
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