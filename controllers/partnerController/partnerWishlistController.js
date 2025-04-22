const ItemDetail = require("../../models/Items/ItemDetail");
const Item=require("../../models/Items/Item")
const Partner = require("../../models/Partner/Partner");
const PartnerWishlist = require("../../models/Partner/PartnerWishlist");
const { apiResponse } = require("../../utils/apiResponse");
const mongoose = require("mongoose");


// Add Item to Wishlist
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

    let wishlist = await PartnerWishlist.findOne({ partnerId:partnerId });
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

    // Populate item and itemDetail for response
    const populatedWishlist = await PartnerWishlist.findById(wishlist._id)
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

// Get User's Wishlist
exports.getPartnerWishlist = async (req, res) => {
  try {
    console.log("Starting getUserWishlist");
    const { partnerId } = req.user;

    // Find wishlist by user ID with population
    const wishlist = await PartnerWishlist.findOne({ partnerId })
    console.log(wishlist)
    // .populate({
    //   path: "items.itemId",
    //   select: "name MRP image categoryId subCategoryId",
    //   populate: [
    //     { path: "categoryId", select: "name" },
    //     { path: "subCategoryId", select: "name" },
    //   ],
    // });

    if (!wishlist || wishlist.items.length === 0) {
      return res.status(200).json(apiResponse(200, true, "Wishlist is empty", { partnerId, items: [] }));
    }

    return res.status(200).json(apiResponse(200, true, "Wishlist fetched successfully", wishlist));
  } catch (error) {
    console.error("Error in getUserWishlist:", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};