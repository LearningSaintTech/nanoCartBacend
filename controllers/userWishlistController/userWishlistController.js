const mongoose = require("mongoose");
const User = require("../../models/User/User"); // Adjust path as needed
const Item = require("../../models/Items/Item"); // Adjust path as needed
const ItemDetail = require("../../models/Items/ItemDetail"); // Adjust path as needed
const UserWishlist = require("../../models/User/UserWishlist"); // Adjust path as needed
const { apiResponse } = require("../../utils/apiResponse"); // Adjust path as needed

// Add Item to Wishlist
exports.addToWishlist = async (req, res) => {
  try {
    console.log("Starting addToWishlist");
    console.log("Request body:", req.body);
    const { userId } = req.user;
    const { itemId, color } = req.body;

    // Validate required fields
    if (!itemId || !color) {
      return res.status(400).json(apiResponse(400, false, "itemId and color are required"));
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemId"));
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

    // Validate color against ItemDetail
    const itemDetail = await ItemDetail.findOne({ itemId });
    if (!itemDetail) {
      return res.status(404).json(apiResponse(404, false, "ItemDetail not found for this item"));
    }
    const colorExists = itemDetail.imagesByColor.some(
      (entry) => entry.color.toLowerCase() === color.toLowerCase()
    );
    if (!colorExists) {
      return res.status(400).json(apiResponse(400, false, `Color ${color} not available for this item`));
    }

    let wishlist = await UserWishlist.findOne({ userId });
    if (!wishlist) {
      // Create new wishlist
      wishlist = new UserWishlist({
        userId,
        items: [{ itemId, color }],
      });
    } else {
      // Check for duplicate itemId and color combination
      const alreadyAdded = wishlist.items.some(
        (i) => i.itemId.toString() === itemId && i.color.toLowerCase() === color.toLowerCase()
      );
      if (alreadyAdded) {
        return res.status(400).json(apiResponse(400, false, "Item with this color already in wishlist"));
      }

      wishlist.items.push({ itemId, color });
    }

    await wishlist.save();

    // Populate item and itemDetail for response
    const populatedWishlist = await UserWishlist.findById(wishlist._id)
    // .populate({
    //   path: "items.itemId",
    //   select: "name MRP image categoryId subCategoryId",
    //   populate: [
    //     { path: "categoryId", select: "name" },
    //     { path: "subCategoryId", select: "name" },
    //   ],
    // });

    return res.status(200).json(
      apiResponse(200, true, "Item added to wishlist successfully", populatedWishlist)
    );
  } catch (error) {
    console.error("Error in addToWishlist:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });
    return res.status(error.statusCode || 500).json(apiResponse(error.statusCode || 500, false, error.message));
  }
};

// Remove Item from Wishlist
exports.removeItemFromWishlist = async (req, res) => {
  try {
    console.log("Starting removeItemFromWishlist");
    console.log("Request body:", req.body);
    const { userId } = req.user;
    const { itemId, color } = req.body;

    // Validate required fields
    if (!itemId || !color) {
      return res.status(400).json(apiResponse(400, false, "itemId and color are required"));
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemId"));
    }

    const wishlist = await UserWishlist.findOne({ userId });
    if (!wishlist) {
      return res.status(404).json(apiResponse(404, false, "Wishlist not found"));
    }

    const initialLength = wishlist.items.length;
    // Remove item that matches BOTH itemId and color
    wishlist.items = wishlist.items.filter(
      (i) => !(i.itemId.toString() === itemId && i.color.toLowerCase() === color.toLowerCase())
    );

    if (initialLength === wishlist.items.length) {
      return res.status(404).json(apiResponse(404, false, "Item with this color not found in wishlist"));
    }

    await wishlist.save();

    // Populate item for response
    const populatedWishlist = await UserWishlist.findById(wishlist._id)
    // .populate({
    //   path: "items.itemId",
    //   select: "name MRP image categoryId subCategoryId",
    //   populate: [
    //     { path: "categoryId", select: "name" },
    //     { path: "subCategoryId", select: "name" },
    //   ],
    // });

    return res.status(200).json(
      apiResponse(200, true, "Item removed from wishlist", populatedWishlist)
    );
  } catch (error) {
    console.error("Error in removeItemFromWishlist:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });
    return res.status(error.statusCode || 500).json(apiResponse(error.statusCode || 500, false, error.message));
  }
};



exports.getUserWishlist = async (req, res) => {
  try {
    console.log("Starting getUserWishlist");
    const { userId } = req.user;

    // Fetch wishlist and populate itemId
    const wishlist = await UserWishlist.findOne({ userId })
      .populate({
        path: "items.itemId",
        model: "Item",
        select: "name description MRP discountedPrice",
      })
      .lean();

    console.log("Fetched wishlist:", JSON.stringify(wishlist, null, 2));

    if (!wishlist || wishlist.items.length === 0) {
      return res
        .status(200)
        .json(apiResponse(200, true, "Wishlist is empty", { userId, items: [] }));
    }

    // Fetch priority 1 image URL from ItemDetail for each item based on itemId and color
    const enhancedItems = await Promise.all(
      wishlist.items.map(async (item) => {
        if (!item.itemId) {
          console.warn(`Null itemId found in wishlist item:`, item);
          return { ...item, url: null };
        }

        // Find ItemDetail matching itemId and color, and get priority 1 image
        const itemDetail = await ItemDetail.findOne(
          {
            itemId: item.itemId._id,
            "imagesByColor.color": item.color,
          },
          {
            "imagesByColor.$": 1, // Get only the matching color object
          }
        ).lean();

        if (!itemDetail) {
          console.warn(`No ItemDetail found for itemId: ${item.itemId._id}, color: ${item.color}`);
          return { ...item, url: null };
        }

        // Get the priority 1 image URL
        const priorityOneImage = itemDetail.imagesByColor[0]?.images.find(
          (img) => img.priority === 1
        );

        return {
          ...item,
          url: priorityOneImage ? priorityOneImage.url : null,
        };
      })
    );

    // Update wishlist items with enhanced data
    wishlist.items = enhancedItems;

    return res
      .status(200)
      .json(apiResponse(200, true, "Wishlist fetched successfully", wishlist));
  } catch (error) {
    console.error("Error in getUserWishlist:", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};


exports.getUserWishlistByAdmin = async (req, res) => {
  try {
    console.log("Starting getUserWishlist");
    const { userId } = req.params;

    // Fetch wishlist and populate itemId
    const wishlist = await UserWishlist.findOne({ userId })
      .populate({
        path: "items.itemId",
        model: "Item",
        select: "name description MRP discountedPrice",
      })
      .lean();

    console.log("Fetched wishlist:", JSON.stringify(wishlist, null, 2));

    if (!wishlist || wishlist.items.length === 0) {
      return res
        .status(200)
        .json(apiResponse(200, true, "Wishlist is empty", { userId, items: [] }));
    }

    // Fetch priority 1 image URL from ItemDetail for each item based on itemId and color
    const enhancedItems = await Promise.all(
      wishlist.items.map(async (item) => {
        if (!item.itemId) {
          console.warn(`Null itemId found in wishlist item:`, item);
          return { ...item, url: null };
        }

        // Find ItemDetail matching itemId and color, and get priority 1 image
        const itemDetail = await ItemDetail.findOne(
          {
            itemId: item.itemId._id,
            "imagesByColor.color": item.color,
          },
          {
            "imagesByColor.$": 1, // Get only the matching color object
          }
        ).lean();

        if (!itemDetail) {
          console.warn(`No ItemDetail found for itemId: ${item.itemId._id}, color: ${item.color}`);
          return { ...item, url: null };
        }

        // Get the priority 1 image URL
        const priorityOneImage = itemDetail.imagesByColor[0]?.images.find(
          (img) => img.priority === 1
        );

        return {
          ...item,
          url: priorityOneImage ? priorityOneImage.url : null,
        };
      })
    );

    // Update wishlist items with enhanced data
    wishlist.items = enhancedItems;

    return res
      .status(200)
      .json(apiResponse(200, true, "Wishlist fetched successfully", wishlist));
  } catch (error) {
    console.error("Error in getUserWishlist:", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};