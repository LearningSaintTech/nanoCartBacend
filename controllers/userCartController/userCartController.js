const mongoose = require("mongoose");
const User = require("../../models/User/User"); // Adjust path as needed
const Item = require("../../models/Items/Item"); // Adjust path as needed
const ItemDetail = require("../../models/Items/ItemDetail"); // Adjust path as needed
const UserCart = require("../../models/User/UserCart"); // Adjust path as needed
const { apiResponse } = require("../../utils/apiResponse"); // Adjust path as needed
const { Category } = require("../../models/Category/Category");

// Add Item to Cart
exports.addToCart = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    const { userId } = req.user; 
    const { itemId, quantity, size, color, skuId } = req.body;

    // Validate required fields
    if (!itemId || !size || !color || !skuId) {
      return res.status(400).json(apiResponse(400, false, "itemId, size, color, and skuId are required"));
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemId"));
    }
    if (quantity && (!Number.isInteger(quantity) || quantity < 1)) {
      return res.status(400).json(apiResponse(400, false, "Quantity must be a positive integer"));
    }

    // Validate userId
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json(apiResponse(404, false, "User not found"));
    }

    // Validate itemId
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json(apiResponse(404, false, "Item not found"));
    }

    // Validate color, size, skuId, and stock against ItemDetail
    const itemDetail = await ItemDetail.findOne({ itemId });
    if (!itemDetail) {
      return res.status(404).json(apiResponse(404, false, "ItemDetail not found for this item"));
    }
    const colorEntry = itemDetail.imagesByColor.find(
      (entry) => entry.color.toLowerCase() === color.toLowerCase()
    );
    if (!colorEntry) {
      return res.status(400).json(apiResponse(400, false, `Color ${color} not available for this item`));
    }
    const sizeEntry = colorEntry.sizes.find(
      (s) => s.size === size && s.skuId === skuId
    );
    if (!sizeEntry) {
      return res.status(400).json(apiResponse(400, false, `Size ${size} with skuId ${skuId} not available for color ${color}`));
    }

    // Check stock availability
    if (sizeEntry.isOutOfStock || sizeEntry.stock === 0) {
      return res.status(400).json(apiResponse(400, false, `Item with size ${size} and color ${color} is out of stock`));
    }
    const requestedQuantity = quantity || 1;
    if (sizeEntry.stock < requestedQuantity) {
      return res.status(400).json(apiResponse(400, false, `Insufficient stock for size ${size} and color ${color}. Available: ${sizeEntry.stock}`));
    }

    let cart = await UserCart.findOne({ userId });
    if (!cart) {
      // Create new cart
      cart = new UserCart({
        userId,
        items: [{ itemId, quantity: requestedQuantity, size, color, skuId }],
      });
    } else {
      // Check for existing item
      const existingItem = cart.items.find(
        (i) =>
          i.itemId &&
          i.itemId.toString() === itemId &&
          i.color.toLowerCase() === color.toLowerCase() &&
          i.size === size &&
          i.skuId === skuId
      );
      if (existingItem) {
        const newQuantity = existingItem.quantity + requestedQuantity;
        if (sizeEntry.stock < newQuantity) {
          return res.status(400).json(apiResponse(400, false, `Insufficient stock for size ${size} and color ${color}. Available: ${sizeEntry.stock}`));
        }
        existingItem.quantity = newQuantity;
      } else {
        // Validate new item before pushing
        const newItem = {
          itemId,
          quantity: requestedQuantity,
          size,
          color,
          skuId,
        };
        if (!newItem.itemId || !newItem.size || !newItem.color || !newItem.skuId) {
          return res.status(400).json(apiResponse(400, false, "Invalid item data: missing required fields"));
        }
        cart.items.push(newItem);
      }
      // Clean up invalid items
      cart.items = cart.items.filter(item => 
        item.itemId && 
        mongoose.Types.ObjectId.isValid(item.itemId) && 
        item.size && 
        item.color && 
        item.skuId
      );
    }

    await cart.save();

    // Populate cart for response
    const populatedCart = await UserCart.findById(cart._id).populate({
      path: "items.itemId",
      select: "name MRP image categoryId subCategoryId",
      populate: [
        { path: "categoryId", select: "name" },
        { path: "subCategoryId", select: "name" },
      ],
    });

    return res.status(200).json(apiResponse(200, true, "Item added to cart", populatedCart));
  } catch (error) {
    console.error("Add to cart error:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });
    return res.status(error.statusCode || 500).json(apiResponse(error.statusCode || 500, false, error.message));
  }
};


// Remove Item from Cart
exports.removeItemFromCart = async (req, res) => {
  try {
    console.log("Starting removeItemFromCart");
    console.log("Request body:", req.body);
    const { userId } = req.user;
    const { itemId, size, color, skuId } = req.body;

    // Validate required fields
    if (!itemId || !size || !color || !skuId) {
      return res.status(400).json(apiResponse(400, false, "itemId, size, color, and skuId are required"));
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemId"));
    }

    const cart = await UserCart.findOne({ userId });
    if (!cart) {
      return res.status(404).json(apiResponse(404, false, "Cart not found"));
    }

    const initialLength = cart.items.length;
    // Filter out the matching item
    cart.items = cart.items.filter(
      (i) =>
        !(
          i.itemId.toString() === itemId &&
          i.color.toLowerCase() === color.toLowerCase() &&
          i.size === size &&
          i.skuId === skuId
        )
    );

    if (initialLength === cart.items.length) {
      return res.status(404).json(apiResponse(404, false, "Item not found in cart"));
    }

    await cart.save();

    // Populate cart for response
    const populatedCart = await UserCart.findById(cart._id)
    

    return res.status(200).json(apiResponse(200, true, "Item removed from cart", populatedCart));
  } catch (error) {
    console.error("Remove item error:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });
    return res.status(error.statusCode || 500).json(apiResponse(error.statusCode || 500, false, error.message));
  }
};



exports.getUserCart = async (req, res) => {
  try {
    console.log("Starting getUserCart");
    const { userId } = req.user;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid userId", null));
    }

    // Fetch cart and populate itemId with name, description, MRP, discountedPrice
    let cart = await UserCart.findOne({ userId }).populate(
      "items.itemId",
      "name description MRP discountedPrice"
    );

    if (!cart || cart.items.length === 0) {
      return res
        .status(200)
        .json(
          apiResponse(200, true, "Cart is empty", { userId, items: [] })
        );
    }

    // Fetch images from ItemDetail based on itemId, color, size, and skuId
    const updatedItems = await Promise.all(
      cart.items.map(async (item) => {
        let image = null;

        try {
          const itemDetail = await ItemDetail.findOne({ itemId: item.itemId._id });
          if (itemDetail) {
            const colorData = itemDetail.imagesByColor.find(
              (colorObj) => colorObj.color.toLowerCase() === item.color.toLowerCase()
            );
            if (colorData) {
              const sizeEntry = colorData.sizes.find(
                (s) => s.size === item.size && s.skuId === item.skuId
              );
              if (
                sizeEntry &&
                colorData.images &&
                colorData.images.length > 0
              ) {
                // Get the image with the highest priority (lowest priority number)
                const sortedImages = colorData.images.sort(
                  (a, b) => (a.priority || 0) - (b.priority || 0)
                );
                image = sortedImages[0]?.url || null;
              }
            }
          }
        } catch (error) {
          console.error(
            `[getUserCart] Error fetching image for itemId ${item.itemId._id}, color ${item.color}, size ${item.size}, skuId ${item.skuId}:`,
            error.message
          );
        }

        return {
          ...item.toObject(),
          itemId: {
            _id: item.itemId._id,
            name: item.itemId.name,
            description: item.itemId.description,
            MRP: item.itemId.MRP,
            discountedPrice: item.itemId.discountedPrice,
            image, // Image from ItemDetail
          },
        };
      })
    );

    const updatedCart = {
      ...cart.toObject(),
      items: updatedItems,
    };

    return res
      .status(200)
      .json(
        apiResponse(200, true, "Cart fetched successfully", updatedCart)
      );
  } catch (error) {
    console.error("Get cart error:", {
      message: error.message,
      stack: error.stack,
    });
    return res
      .status(500)
      .json(apiResponse(500, false, error.message || "Server error"));
  }
};


exports.updateCartItemQuantity = async (req, res) => {
  try {
    console.log("Starting updateCartItemQuantity");
    console.log("Request body:", req.body);
    const { userId } = req.user;
    const { itemId, size, color, skuId, action } = req.body;

    // Validate required fields
    if (!itemId || !size || !color || !skuId || !action) {
      return res
        .status(400)
        .json(
          apiResponse(
            400,
            false,
            "itemId, size, color, skuId, and action are required"
          )
        );
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemId"));
    }

    // Convert action to lowercase
    const normalizedAction = action.toLowerCase();
    if (!["increase", "decrease"].includes(normalizedAction)) {
      return res
        .status(400)
        .json(
          apiResponse(400, false, "Action must be 'increase' or 'decrease'")
        );
    }

    // Find the cart
    const cart = await UserCart.findOne({ userId });
    if (!cart) {
      return res.status(404).json(apiResponse(404, false, "Cart not found"));
    }
    console.log(cart);

    console.log("3333");
    // Find the item in the cart
    const itemIndex = cart.items.findIndex(
      (i) =>
        i.itemId.toString() === itemId &&
        i.color.toLowerCase() === color.toLowerCase() &&
        i.size === size &&
        i.skuId === skuId
    );
    if (itemIndex === -1) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Item not found in cart"));
    }

    // Validate stock for the item
    const itemDetail = await ItemDetail.findOne({ itemId });
    if (!itemDetail) {
      return res.status(404).json(apiResponse(404, false, "ItemDetail not found for this item"));
    }
    const colorEntry = itemDetail.imagesByColor.find(
      (entry) => entry.color.toLowerCase() === color.toLowerCase()
    );
    if (!colorEntry) {
      return res.status(400).json(apiResponse(400, false, `Color ${color} not available for this item`));
    }
    const sizeEntry = colorEntry.sizes.find(
      (s) => s.size === size && s.skuId === skuId
    );
    if (!sizeEntry) {
      return res.status(400).json(apiResponse(400, false, `Size ${size} with skuId ${skuId} not available for color ${color}`));
    }
    console.log("22222222");
    // Store the item before updating
    let updatedItem = { ...cart.items[itemIndex].toObject() };
    const previousQuantity = cart.items[itemIndex].quantity;

    console.log("1111111111",previousQuantity);

    // Check stock availability for increase action
    if (normalizedAction === "increase") {
      if (sizeEntry.isOutOfStock || sizeEntry.stock === 0) {
        return res.status(400).json(apiResponse(400, false, `Item with size ${size} and color ${color} is out of stock`));
      }
      const newQuantity = previousQuantity + 1;
      if (newQuantity > sizeEntry.stock) {
        return res.status(400).json(apiResponse(400, false, `Stock not available: requested quantity (${newQuantity}) exceeds available stock (${sizeEntry.stock}) for size ${size} and color ${color}`));
      }
      cart.items[itemIndex].quantity = newQuantity;
      updatedItem.quantity = newQuantity;
    } else if (normalizedAction === "decrease") {
      if (previousQuantity <= 1) {
        cart.items.splice(itemIndex, 1);
        await cart.save();
        return res
          .status(200)
          .json(apiResponse(200, true, "Item removed from cart", null));
      } else {
        cart.items[itemIndex].quantity -= 1;
        updatedItem.quantity -= 1;
      }
    }

    await cart.save();

    // Fetch the updated item and populate itemId with name, description, MRP, discountedPrice
    const populatedCart = await UserCart.findOne(
      { _id: cart._id, "items._id": updatedItem._id },
      { "items.$": 1 } // Select only the matching item
    ).populate("items.itemId", "name description MRP discountedPrice");

    if (!populatedCart || !populatedCart.items[0]) {
      return res
        .status(500)
        .json(
          apiResponse(500, false, "Error fetching updated cart item")
        );
    }

    const item = populatedCart.items[0];

    // Fetch image from ItemDetail based on itemId, color, size, and skuId
    let image = null;
    try {
      const itemDetailForImage = await ItemDetail.findOne({ itemId: item.itemId._id });
      if (itemDetailForImage) {
        const colorData = itemDetailForImage.imagesByColor.find(
          (colorObj) => colorObj.color.toLowerCase() === item.color.toLowerCase()
        );
        if (colorData) {
          const sizeEntry = colorData.sizes.find(
            (s) => s.size === item.size && s.skuId === item.skuId
          );
          if (sizeEntry && colorData.images && colorData.images.length > 0) {
            // Get the image with the highest priority (lowest priority number)
            const sortedImages = colorData.images.sort(
              (a, b) => (a.priority || 0) - (b.priority || 0)
            );
            image = sortedImages[0]?.url || null;
          }
        }
      }
    } catch (error) {
      console.error(
        `[updateCartItemQuantity] Error fetching image for itemId ${item.itemId._id}, color ${item.color}, size ${item.size}, skuId ${item.skuId}:`,
        error.message
      );
    }

    // Construct the response item
    const responseItem = {
      ...item.toObject(),
      itemId: {
        _id: item.itemId._id,
        name: item.itemId.name,
        description: item.itemId.description,
        MRP: item.itemId.MRP,
        discountedPrice: item.itemId.discountedPrice,
        image, // Image from ItemDetail
      },
    };

    return res
      .status(200)
      .json(
        apiResponse(
          200,
          true,
          "Item quantity updated successfully",
          responseItem
        )
      );
  } catch (error) {
    console.error("Update cart item quantity error:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });
    return res
      .status(error.statusCode || 500)
      .json(
        apiResponse(
          error.statusCode || 500,
          false,
          error.message || "Server error"
        )
      );
  }
};




exports.getUserCartByAdmin = async (req, res) => {
  try {
    console.log("Starting getUserCart");
    const { userId } = req.params;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid userId", null));
    }

    // Fetch cart and populate itemId with name, description, MRP, discountedPrice
    let cart = await UserCart.findOne({ userId }).populate(
      "items.itemId",
      "name description MRP discountedPrice"
    );

    if (!cart || cart.items.length === 0) {
      return res
        .status(200)
        .json(
          apiResponse(200, true, "Cart is empty", { userId, items: [] })
        );
    }

    // Fetch images from ItemDetail based on itemId, color, size, and skuId
    const updatedItems = await Promise.all(
      cart.items.map(async (item) => {
        let image = null;

        try {
          const itemDetail = await ItemDetail.findOne({ itemId: item.itemId._id });
          if (itemDetail) {
            const colorData = itemDetail.imagesByColor.find(
              (colorObj) => colorObj.color.toLowerCase() === item.color.toLowerCase()
            );
            if (colorData) {
              const sizeEntry = colorData.sizes.find(
                (s) => s.size === item.size && s.skuId === item.skuId
              );
              if (
                sizeEntry &&
                colorData.images &&
                colorData.images.length > 0
              ) {
                // Get the image with the highest priority (lowest priority number)
                const sortedImages = colorData.images.sort(
                  (a, b) => (a.priority || 0) - (b.priority || 0)
                );
                image = sortedImages[0]?.url || null;
              }
            }
          }
        } catch (error) {
          console.error(
            `[getUserCart] Error fetching image for itemId ${item.itemId._id}, color ${item.color}, size ${item.size}, skuId ${item.skuId}:`,
            error.message
          );
        }

        return {
          ...item.toObject(),
          itemId: {
            _id: item.itemId._id,
            name: item.itemId.name,
            description: item.itemId.description,
            MRP: item.itemId.MRP,
            discountedPrice: item.itemId.discountedPrice,
            image, // Image from ItemDetail
          },
        };
      })
    );

    const updatedCart = {
      ...cart.toObject(),
      items: updatedItems,
    };

    return res
      .status(200)
      .json(
        apiResponse(200, true, "Cart fetched successfully", updatedCart)
      );
  } catch (error) {
    console.error("Get cart error:", {
      message: error.message,
      stack: error.stack,
    });
    return res
      .status(500)
      .json(apiResponse(500, false, error.message || "Server error"));
  }
};



