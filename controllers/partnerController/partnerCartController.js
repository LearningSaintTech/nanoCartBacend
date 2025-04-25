
const mongoose = require("mongoose");
const PartnerCart = require("../../models/Partner/PartnerCart");
const Partner = require("../../models/Partner/Partner");
const Item = require("../../models/Items/Item");
const ItemDetail = require("../../models/Items/ItemDetail");
const { apiResponse } = require("../../utils/apiResponse");

// Add Item to Cart
exports.addToCart = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { itemId, orderDetails } = req.body;

    // Validate itemId
    if (!itemId) {
      return res.status(400).json(apiResponse(400, false, "itemId is required"));
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemId"));
    }

    // Validate orderDetails
    if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
      return res.status(400).json(apiResponse(400, false, "orderDetails must be a non-empty array"));
    }
    for (let i = 0; i < orderDetails.length; i++) {
      const detail = orderDetails[i];
      if (!detail.color || typeof detail.color !== 'string') {
        return res.status(400).json(apiResponse(400, false, `orderDetails[${i}].color is required and must be a string`));
      }
      if (!Array.isArray(detail.sizeAndQuantity) || detail.sizeAndQuantity.length === 0) {
        return res.status(400).json(apiResponse(400, false, `orderDetails[${i}].sizeAndQuantity must be a non-empty array`));
      }
      for (let j = 0; j < detail.sizeAndQuantity.length; j++) {
        const v = detail.sizeAndQuantity[j];
        if (!v.size || typeof v.size !== 'string') {
          return res.status(400).json(apiResponse(400, false, `orderDetails[${i}].sizeAndQuantity[${j}].size is required and must be a string`));
        }
        if (!Number.isInteger(v.quantity) || v.quantity < 1) {
          return res.status(400).json(apiResponse(400, false, `orderDetails[${i}].sizeAndQuantity[${j}].quantity must be a positive integer`));
        }
        if (!v.skuId || typeof v.skuId !== 'string') {
          return res.status(400).json(apiResponse(400, false, `orderDetails[${i}].sizeAndQuantity[${j}].skuId is required and must be a string`));
        }
      }
    }

    // Check partner existence
    if (!await Partner.exists({ _id: partnerId })) {
      return res.status(404).json(apiResponse(404, false, "Partner not found"));
    }
    // Check item existence
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json(apiResponse(404, false, "Item not found"));
    }
    // Check variant availability for each detail
    const detailDoc = await ItemDetail.findOne({ itemId });
    if (!detailDoc) {
      return res.status(404).json(apiResponse(404, false, "ItemDetail not found"));
    }
    for (const detail of orderDetails) {
      const colorEntry = detailDoc.imagesByColor.find(e => e.color.toLowerCase() === detail.color.toLowerCase());
      if (!colorEntry) {
        return res.status(400).json(apiResponse(400, false, `Color '${detail.color}' not available`));
      }
      for (const v of detail.sizeAndQuantity) {
        const variant = colorEntry.sizes.find(s => s.size === v.size && s.skuId === v.skuId);
        if (!variant) {
          return res.status(400).json(apiResponse(400, false, `Variant size '${v.size}' with skuId '${v.skuId}' not available for color '${detail.color}'`));
        }
      }
    }

    // Calculate total
    const unitPrice = item.discountedPrice || 0;
    let addQty = 0, addPrice = 0;
    orderDetails.forEach(detail => {
      detail.sizeAndQuantity.forEach(v => {
        addQty += v.quantity;
        addPrice += unitPrice * v.quantity;
      });
    });

    // Find or create cart
    let cart = await PartnerCart.findOne({ partnerId });
    if (!cart) {
      cart = new PartnerCart({
        partnerId,
        items: [{
          itemId,
          orderDetails,
          totalQuantity: addQty,
          totalPrice: addPrice,
          addedAt: Date.now()
        }]
      });
    } else {
      let row = cart.items.find(i => i.itemId.toString() === itemId);
      if (!row) {
        cart.items.push({ itemId, orderDetails, totalQuantity: addQty, totalPrice: addPrice, addedAt: Date.now() });
      } else {
        // Merge orderDetails
        orderDetails.forEach(detail => {
          let colorRow = row.orderDetails.find(od => od.color.toLowerCase() === detail.color.toLowerCase());
          if (!colorRow) {
            row.orderDetails.push(detail);
          } else {
            detail.sizeAndQuantity.forEach(v => {
              let varRow = colorRow.sizeAndQuantity.find(x => x.size === v.size && x.skuId === v.skuId);
              if (varRow) varRow.quantity += v.quantity;
              else colorRow.sizeAndQuantity.push(v);
            });
          }
        });
        row.totalQuantity += addQty;
        row.totalPrice += addPrice;
      }
    }

    await cart.save();
    console.log("Saved cart",cart)
    const result = await PartnerCart.findById(cart._id);
    return res.status(200).json(apiResponse(200, true, "Item added to cart", result));
  } catch (error) {
    console.error("Add to cart error:", error);
    return res.status(500).json(apiResponse(500, false, error.message));
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



// Get Partner's Cart
exports.getPartnerCart = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const cart = await PartnerCart.findOne({ partnerId });
    if (!cart || !cart.items.length) {
      return res.status(200).json(apiResponse(200,true,"Cart is empty",{ partnerId, items: [] }));
    }
    return res.status(200).json(apiResponse(200,true,"Cart fetched successfully",cart));
  } catch (error) {
    console.error("Get cart error:", error);
    return res.status(500).json(apiResponse(500,false,error.message));
  }
};
