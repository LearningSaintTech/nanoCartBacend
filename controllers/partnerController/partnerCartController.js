
const mongoose = require("mongoose");
const PartnerCart = require("../../models/Partner/PartnerCart");
const Partner = require("../../models/Partner/Partner");
const Item = require("../../models/Items/Item");
const ItemDetail = require("../../models/Items/ItemDetail");
const { apiResponse } = require("../../utils/apiResponse");




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

    // Validate partner
    if (!await Partner.exists({ _id: partnerId })) {
      return res.status(404).json(apiResponse(404, false, "Partner not found"));
    }

    // Validate item
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json(apiResponse(404, false, "Item not found"));
    }

    // Validate item details
    const detailDoc = await ItemDetail.findOne({ itemId });
    if (!detailDoc) {
      return res.status(404).json(apiResponse(404, false, "ItemDetail not found for this Item"));
    }

    // Validate colors and variants
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

    const unitPrice = item.discountedPrice || 0;

    let cart = await PartnerCart.findOne({ partnerId });
    if (!cart) {
      // Create new cart
      const totalQty = orderDetails.reduce((sum, d) => sum + d.sizeAndQuantity.reduce((s, v) => s + v.quantity, 0), 0);
      const totalPrice = totalQty * unitPrice;

      cart = new PartnerCart({
        partnerId,
        items: [{
          itemId,
          orderDetails,
          totalQuantity: totalQty,
          totalPrice: totalPrice,
          addedAt: Date.now()
        }]
      });
    } else {
      // Update existing cart
      let itemEntry = cart.items.find(i => i.itemId.toString() === itemId);
      if (!itemEntry) {
        // New item in cart
        const totalQty = orderDetails.reduce((sum, d) => sum + d.sizeAndQuantity.reduce((s, v) => s + v.quantity, 0), 0);
        const totalPrice = totalQty * unitPrice;
        cart.items.push({
          itemId,
          orderDetails,
          totalQuantity: totalQty,
          totalPrice: totalPrice,
          addedAt: Date.now()
        });
      } else {
        // Update existing item
        for (const newDetail of orderDetails) {
          let existingDetail = itemEntry.orderDetails.find(d => 
            d.color.toLowerCase() === newDetail.color.toLowerCase()
          );

          if (existingDetail) {
            // Same color exists, check and update sizeAndQuantity
            for (const newVariant of newDetail.sizeAndQuantity) {
              let existingVariant = existingDetail.sizeAndQuantity.find(v => 
                v.size.toLowerCase() === newVariant.size.toLowerCase() && 
                v.skuId === newVariant.skuId
              );

              if (existingVariant) {
                // Size and skuId exist, increase quantity
                existingVariant.quantity += newVariant.quantity;
              } else {
                // New size/sku, add to sizeAndQuantity
                existingDetail.sizeAndQuantity.push({
                  size: newVariant.size,
                  quantity: newVariant.quantity,
                  skuId: newVariant.skuId
                });
              }
            }
          } else {
            // New color, add entire detail
            itemEntry.orderDetails.push(newDetail);
          }
        }

        // Recalculate totals
        itemEntry.totalQuantity = itemEntry.orderDetails.reduce((sum, d) => 
          sum + d.sizeAndQuantity.reduce((s, v) => s + v.quantity, 0), 0
        );
        itemEntry.totalPrice = itemEntry.totalQuantity * unitPrice;
      }
    }

    await cart.save();
    const result = await PartnerCart.findById(cart._id);
    return res.status(200).json(apiResponse(200, true, "Item added to cart"));
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
