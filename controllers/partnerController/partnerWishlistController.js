const ItemDetail = require("../../models/Items/ItemDetail");
const Item=require("../../models/Items/Item")
const Partner = require("../../models/Partner/Partner");
const PartnerWishlist = require("../../models/Partner/PartnerWishlist");
const { apiResponse } = require("../../utils/apiResponse");
const mongoose = require("mongoose");

exports.addToWishlist = async (req, res) => {
  try {
    console.log("Starting addToWishlist");
    console.log("Request body:", req.body);
    const { partnerId } = req.user;
    const { itemId, color } = req.body;

    // Validate required fields
    if (!itemId || !color) {
      return res.status(400).json(apiResponse(400, false, "itemId and color are required"));
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemId"));
    }

    // Validate userId
    const partnerExists = await Partner.exists({ _id: partnerId });
    if (!partnerExists) {
      return res.status(404).json(apiResponse(404, false, "Partner not found"));
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

    let wishlist = await PartnerWishlist.findOne({ partnerId: partnerId });
    if (!wishlist) {
      // Create new wishlist
      wishlist = new PartnerWishlist({
        partnerId,
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

    // Fetch image with priority 1 from ItemDetail for the given itemId and color
    const itemDetailForImage = await ItemDetail.findOne({ itemId });
    const colorEntry = itemDetailForImage.imagesByColor.find(
      (entry) => entry.color.toLowerCase() === color.toLowerCase()
    );
    if (!colorEntry) {
      return res.status(400).json(apiResponse(400, false, `Color ${color} not available for this item`));
    }
    const priorityImage = colorEntry.images.find((image) => image.priority === 1);
    if (!priorityImage) {
      return res.status(400).json(apiResponse(400, false, `No image with priority 1 found for color ${color}`));
    }

    // Fetch all fields of the newly added itemId without populating references
    const populatedItem = await Item.findById(itemId)
      .lean();

    // Construct response data
    const responseData = {
      wishlistId: wishlist._id,
      item: {
        itemId: populatedItem,
        color,
        image: priorityImage.url,
      },
    };

    return res.status(200).json(
      apiResponse(200, true, "Item added to wishlist successfully", responseData)
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
    const { partnerId } = req.user;
    const { itemId, color } = req.body;

    // Validate required fields
    if (!itemId || !color) {
      return res.status(400).json(apiResponse(400, false, "itemId and color are required"));
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemId"));
    }

    const wishlist = await PartnerWishlist.findOne({ partnerId });
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
    const populatedWishlist = await PartnerWishlist.findById(wishlist._id)

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


exports.getPartnerWishlist = async (req, res) => {
  try {
    console.log("Starting getPartnerWishlist");
    const { partnerId } = req.user;

    // Find wishlist by partner ID
    const wishlist = await PartnerWishlist.findOne({ partnerId }).lean();
    console.log(wishlist);

    if (!wishlist || wishlist.items.length === 0) {
      return res.status(200).json(apiResponse(200, true, "Wishlist is empty", { partnerId, items: [] }));
    }

    // Populate all fields of itemId for each item and fetch image from ItemDetail
    const populatedItems = await Promise.all(
      wishlist.items.map(async (item) => {
        // Fetch all fields of the itemId
        const populatedItem = await Item.findById(item.itemId).lean();
        if (!populatedItem) {
          return null; // Skip if item not found
        }

        // Fetch image with priority 1 from ItemDetail for the given itemId and color
        const itemDetail = await ItemDetail.findOne({ itemId: item.itemId });
        let image = null;
        if (itemDetail) {
          const colorEntry = itemDetail.imagesByColor.find(
            (entry) => entry.color.toLowerCase() === item.color.toLowerCase()
          );
          if (colorEntry) {
            const priorityImage = colorEntry.images.find((img) => img.priority === 1);
            image = priorityImage ? priorityImage.url : null;
          }
        }

        return {
          itemId: populatedItem,
          color: item.color,
          image,
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

    return res.status(200).json(apiResponse(200, true, "Wishlist fetched successfully", responseData));
  } catch (error) {
    console.error("Error in getPartnerWishlist:", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};



exports.getPartnerWishlistForAdmin = async (req, res) => {
  try {
    console.log("Starting getPartnerWishlist");
    const { partnerId } = req.params;

    // Find wishlist by partner ID
    const wishlist = await PartnerWishlist.findOne({ partnerId }).lean();
    console.log(wishlist);

    if (!wishlist || wishlist.items.length === 0) {
      return res.status(200).json(apiResponse(200, true, "Wishlist is empty", { partnerId, items: [] }));
    }

    // Populate all fields of itemId for each item and fetch image from ItemDetail
    const populatedItems = await Promise.all(
      wishlist.items.map(async (item) => {
        // Fetch all fields of the itemId
        const populatedItem = await Item.findById(item.itemId).lean();
        if (!populatedItem) {
          return null; // Skip if item not found
        }

        // Fetch image with priority 1 from ItemDetail for the given itemId and color
        const itemDetail = await ItemDetail.findOne({ itemId: item.itemId });
        let image = null;
        if (itemDetail) {
          const colorEntry = itemDetail.imagesByColor.find(
            (entry) => entry.color.toLowerCase() === item.color.toLowerCase()
          );
          if (colorEntry) {
            const priorityImage = colorEntry.images.find((img) => img.priority === 1);
            image = priorityImage ? priorityImage.url : null;
          }
        }

        return {
          itemId: populatedItem,
          color: item.color,
          image,
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

    return res.status(200).json(apiResponse(200, true, "Wishlist fetched successfully", responseData));
  } catch (error) {
    console.error("Error in getPartnerWishlist:", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};