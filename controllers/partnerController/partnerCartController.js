const ItemDetail = require("../../models/Items/ItemDetail");
const Partner = require("../../models/Partner/Partner");
const PartnerCart = require("../../models/Partner/PartnerCart");
const { apiResponse } = require("../../utils/apiResponse");
const mongoose = require("mongoose");

// Add Item to Partner Cart
exports.addToCart = async (req, res) => {
  try {
    const { partnerId } = req.user; 
    const { itemDetailId, color,size, quantity, skuId } = req.body;

    // Validate required fields 
    if (!itemDetailId || !color || !quantity || !size || !skuId) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            false,
            "itemDetailsId, color, quantity, and skuId are required"
          )
        );
    }
    if (!mongoose.Types.ObjectId.isValid(itemDetailId)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Invalid itemDetailsId"));
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Quantity must be a positive integer"));
    }

    // Verify the item exists
    const itemExists = await ItemDetail.findById(itemDetailId);
    if (!itemExists) {
      return res.status(404).json(apiResponse(404, false, "Item not found"));
    }

    let cart = await PartnerCart.findOne({ partnerId: partnerId });
    if (!cart) {
      // Create new cart
      cart = new PartnerCart({
        partnerId: partnerId,
        items: [{ itemDetailId, color,size, quantity, skuId }],
      });
      await cart.save();
    } else {
      // Check if item with same itemDetailsId, color, and skuId exists
      const existingItemIndex = cart.items.findIndex(
        (i) =>
          i.itemDetailId.toString() === itemDetailId &&
          i.color === color &&
          i.size === size &&
          i.skuId === skuId 
      );
      if (existingItemIndex !== -1) {
        // Update quantity if item exists
        cart.items[existingItemIndex].quantity += quantity;
      } else {
        // Add new item
        cart.items.push({ itemDetailId, color, quantity,size, skuId });
      }
      await cart.save();
    }

    return res
      .status(200)
      .json(apiResponse(200, true, "Item added to cart successfully", cart));
  } catch (error) {
    console.error("Error in addToCart (Partner):", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};

// Remove Item from Partner Cart
exports.removeFromCart = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { itemDetailId, color, size, skuId } = req.body;

    // Validate required fields
    if (!itemDetailId || !color || !skuId ||!size) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            false,
            "itemDetailsId, color, size, and skuId are required"
          )
        );
    }
    if (!mongoose.Types.ObjectId.isValid(itemDetailId)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Invalid itemDetailsId"));
    }

    const cart = await PartnerCart.findOne({ partnerId: partnerId });
    if (!cart) {
      return res.status(404).json(apiResponse(404, false, "Cart not found"));
    }

    const initialLength = cart.items.length;
    cart.items = cart.items.filter(
      (i) =>
        !(
          i.itemDetailId.toString() === itemDetailId &&
          i.color === color &&
          i.size === size &&
          i.skuId === skuId
        )
    );

    if (initialLength === cart.items.length) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Item not found in cart"));
    }

    await cart.save();

    return res
      .status(200)
      .json(apiResponse(200, true, "Item removed from cart", cart.items));
  } catch (error) {
    console.error("Error in removeFromCart (Partner):", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


// Update Item Quantity in Partner Cart
exports.updateCartItemQuantity = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { itemDetailId, color, size, skuId, action } = req.body;

    // Validate required fields
    if (!itemDetailId || !color || !skuId || !size || !action) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            false,
            "itemDetailsId, color,size , skuId, and action are required"
          )
        );
    }
    if (!mongoose.Types.ObjectId.isValid(itemDetailId)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Invalid itemDetailsId"));
    }
    if (!["increase", "decrease"].includes(action)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Action must be 'increase' or 'decrease'"));
    }

    // Find the partner's cart
    const cart = await PartnerCart.findOne({ partner: partnerId });
    if (!cart) {
      return res.status(404).json(apiResponse(404, false, "Cart not found"));
    }

    // Find the item in the cart
    const itemIndex = cart.items.findIndex(
      (i) =>
        i.itemDetailId.toString() === itemDetailId &&
        i.color === color &&
        i.size === size &&
        i.skuId === skuId
    );

    if (itemIndex === -1) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Item not found in cart"));
    }

    // Update quantity based on action
    if (action === "increase") {
      cart.items[itemIndex].quantity = (cart.items[itemIndex].quantity || 1) + 1;
    } else if (action === "decrease") {
      const currentQuantity = cart.items[itemIndex].quantity || 1;
      if (currentQuantity <= 1) {
        // Optionally remove the item if quantity would become 0
        cart.items.splice(itemIndex, 1);
      } else {
        cart.items[itemIndex].quantity = currentQuantity - 1;
      }
    }

    // Save the updated cart
    await cart.save();
 
    return res
      .status(200)
      .json(
        apiResponse(200, true, "Item quantity updated successfully", cart.items)
      );
  } catch (error) {
    console.error("Error in updateCartItemQuantity (Partner):", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};



exports.getPartnerCart = async (req, res) => {
  try {
    const { partnerId } = req.user;

    // Find cart by partner ID
    const cart = await PartnerCart.findOne({ partnerId: partnerId })


    if (!cart || cart.items.length === 0) {
      return res.status(404).json(apiResponse(404, false, "Cart is empty"));
    }

    return res.status(200).json(
      apiResponse(200, true, "Cart fetched successfully",items,)
    );
  } catch (error) {
    console.error("Error in getPartnerCart:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};



