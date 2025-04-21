const mongoose = require("mongoose");
const User = require("../../models/User/User"); // Adjust path as needed
const Item = require("../../models/Items/Item"); // Adjust path as needed
const ItemDetail = require("../../models/Items/ItemDetail"); // Adjust path as needed
const UserCart = require("../../models/User/UserCart"); // Adjust path as needed
const { apiResponse } = require("../../utils/apiResponse"); // Adjust path as needed

// Add Item to Cart
exports.addToCart = async (req, res) => {
  try {
    console.log("Starting addToCart");
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

    // Validate color, size, and skuId against ItemDetail
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

    let cart = await UserCart.findOne({ userId });
    if (!cart) {
      // Create new cart
      cart = new UserCart({
        userId,
        items: [{ itemId, quantity: quantity || 1, size, color, skuId }],
      });
    } else {
      // Check for existing item
      const existingItem = cart.items.find(
        (i) =>
          i.itemId.toString() === itemId &&
          i.color.toLowerCase() === color.toLowerCase() &&
          i.size === size &&
          i.skuId === skuId
      );
      if (existingItem) {
        existingItem.quantity += quantity || 1;
      } else {
        cart.items.push({ itemId, quantity: quantity || 1, size, color, skuId });
      }
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
    // .populate({
    //   path: "items.itemId",
    //   select: "name MRP image categoryId subCategoryId",
    //   populate: [
    //     { path: "categoryId", select: "name" },
    //     { path: "subCategoryId", select: "name" },
    //   ],
    // });

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

// Get User's Cart
exports.getUserCart = async (req, res) => {
  try {
    console.log("Starting getUserCart");
    const { userId } = req.user;

    const cart = await UserCart.findOne({ userId })
    // .populate({
    //   path: "items.itemId",
    //   select: "name MRP image categoryId subCategoryId",
    //   populate: [
    //     { path: "categoryId", select: "name" },
    //     { path: "subCategoryId", select: "name" },
    //   ],
    // });

    if (!cart || cart.items.length === 0) {
      return res.status(200).json(apiResponse(200, true, "Cart is empty", { userId, items: [] }));
    }

    return res.status(200).json(apiResponse(200, true, "Cart fetched successfully", cart));
  } catch (error) {
    console.error("Get cart error:", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

// // Update Item Quantity in Cart
// exports.updateCartItemQuantity = async (req, res) => {
//   try {
//     console.log("Starting updateCartItemQuantity");
//     console.log("Request body:", req.body);
//     const { userId } = req.user;
//     const { itemId, size, color, skuId, action } = req.body;

//     // Validate required fields
//     if (!itemId || !size || !color || !skuId || !action) {
//       return res.status(400).json(
//         apiResponse(400, false, "itemId, size, color, skuId, and action are required")
//       );
//     }
//     if (!mongoose.Types.ObjectId.isValid(itemId)) {
//       return res.status(400).json(apiResponse(400, false, "Invalid itemId"));
//     }

//     // Convert action to lowercase
//     const normalizedAction = action.toLowerCase();
//     if (!["increase", "decrease"].includes(normalizedAction)) {
//       return res.status(400).json(apiResponse(400, false, "Action must be 'increase' or 'decrease'"));
//     }

//     // Find the cart
//     const cart = await UserCart.findOne({ userId });
//     if (!cart) {
//       return res.status(404).json(apiResponse(404, false, "Cart not found"));
//     }

//     // Find the item in the cart
//     const itemIndex = cart.items.findIndex(
//       (i) =>
//         i.itemId.toString() === itemId &&
//         i.color.toLowerCase() === color.toLowerCase() &&
//         i.size === size &&
//         i.skuId === skuId
//     );
//     if (itemIndex === -1) {
//       return res.status(404).json(apiResponse(404, false, "Item not found in cart"));
//     }

//     // Update quantity
//     if (normalizedAction === "increase") {
//       cart.items[itemIndex].quantity += 1;
//     } else if (normalizedAction === "decrease") {
//       if (cart.items[itemIndex].quantity <= 1) {
//         cart.items.splice(itemIndex, 1);
//       } else {
//         cart.items[itemIndex].quantity -= 1;
//       }
//     }

//     await cart.save();

//     // Populate cart for response
//     const populatedCart = await UserCart.findById(cart._id)
//     // .populate({
//     //   path: "items.itemId",
//     //   select: "name MRP image categoryId subCategoryId",
//     //   populate: [
//     //     { path: "categoryId", select: "name" },
//     //     { path: "subCategoryId", select: "name" },
//     //   ],
//     // });

//     return res.status(200).json(
//       apiResponse(200, true, "Item quantity updated successfully", populatedCart)
//     );
//   } catch (error) {
//     console.error("Update cart item quantity error:", {
//       message: error.message,
//       stack: error.stack,
//       body: req.body,
//     });
//     return res.status(error.statusCode || 500).json(apiResponse(error.statusCode || 500, false, error.message));
//   }
// };



// Update Item Quantity in Cart
  exports.updateCartItemQuantity = async (req, res) => {
    try {
      console.log("Starting updateCartItemQuantity");
      console.log("Request body:", req.body);
      const { userId } = req.user;
      const { itemId, size, color, skuId, action } = req.body;

      // Validate required fields
      if (!itemId || !size || !color || !skuId || !action) {
        return res.status(400).json(
          apiResponse(400, false, "itemId, size, color, skuId, and action are required")
        );
      }
      if (!mongoose.Types.ObjectId.isValid(itemId)) {
        return res.status(400).json(apiResponse(400, false, "Invalid itemId"));
      }

      // Convert action to lowercase
      const normalizedAction = action.toLowerCase();
      if (!["increase", "decrease"].includes(normalizedAction)) {
        return res.status(400).json(apiResponse(400, false, "Action must be 'increase' or 'decrease'"));
      }

      // Find the cart
      const cart = await UserCart.findOne({ userId });
      if (!cart) {
        return res.status(404).json(apiResponse(404, false, "Cart not found"));
      }

      // Find the item in the cart
      const itemIndex = cart.items.findIndex(
        (i) =>
          i.itemId.toString() === itemId &&
          i.color.toLowerCase() === color.toLowerCase() &&
          i.size === size &&
          i.skuId === skuId
      );
      if (itemIndex === -1) {
        return res.status(404).json(apiResponse(404, false, "Item not found in cart"));
      }

      // Store the item before updating (for response if removed)
      let updatedItem = { ...cart.items[itemIndex].toObject() };

      // Update quantity
      if (normalizedAction === "increase") {
        cart.items[itemIndex].quantity += 1;
        updatedItem.quantity += 1; // Update the response item
      } else if (normalizedAction === "decrease") {
        if (cart.items[itemIndex].quantity <= 1) {
          cart.items.splice(itemIndex, 1);
          return res.status(200).json(
            apiResponse(200, true, "Item removed from cart", null)
          );
        } else {
          cart.items[itemIndex].quantity -= 1;
          updatedItem.quantity -= 1; // Update the response item
        }
      }

      await cart.save();

      // Populate the specific item's itemId
      const populatedItem = await UserCart.findOne(
        { _id: cart._id, "items._id": updatedItem._id },
        {
          "items.$": 1 // Select only the matching item
        })
      // ).populate({
      //   path: "items.itemId",
      //   select: "name MRP image categoryId subCategoryId",
      //   populate: [
      //     { path: "categoryId", select: "name" },
      //     { path: "subCategoryId", select: "name" },
      //   ],
      // });

      

      return res.status(200).json(
        apiResponse(200, true, "Item quantity updated successfully", populatedItem)
      );
    } catch (error) {
      console.error("Update cart item quantity error:", {
        message: error.message,
        stack: error.stack,
        body: req.body,
      });
      return res.status(error.statusCode || 500).json(apiResponse(error.statusCode || 500, false, error.message));
    }
  };