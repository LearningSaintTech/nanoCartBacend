const ItemDetail = require("../../models/Items/ItemDetail");
const Partner = require("../../models/Partner/Partner");
const PartnerWishlist = require("../../models/Partner/PartnerWishlist");
const { apiResponse } = require("../../utils/apiResponse");
const mongoose = require("mongoose");

// Add Item to Partner Wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const { partnerId } = req.user; 
    const { itemDetailId, color } = req.body;

    // Validate required fields
    if (!itemDetailId || !color) {
      return res.status(400).json(
        apiResponse(400, false, "itemDetailsId and color are required")
      );
    }
    if (!mongoose.Types.ObjectId.isValid(itemDetailId)) {
      return res.status(400).json(
        apiResponse(400, false, "Invalid itemDetailsId")
      );
    }

    // Verify the item exists
    const itemExists = await ItemDetail.findById({_id:itemDetailId});
    if (!itemExists) {
      return res.status(404).json(apiResponse(404, false, "Item not found"));
    }

    let wishlist = await PartnerWishlist.findOne({ partnerId: partnerId });
    if (!wishlist) {
      // Create new wishlist
      wishlist = new PartnerWishlist({
        partnerId,
        items: [{ itemDetailId, color }],
      });
      await wishlist.save();
    } 
    else {
      // Check if item already exists in wishlist
      const alreadyAdded = wishlist.items.some(
        (i) => i.itemDetailId.toString() === itemDetailId && i.color === color
      );
      if (alreadyAdded) {
        return res.status(400).json(
          apiResponse(400, false, "Item already in wishlist")
        );
      }

      wishlist.items.push({ itemDetailId, color });
      await wishlist.save();
    }

    return res.status(200).json(
      apiResponse(200, true, "Item added to wishlist successfully", wishlist)
    );
  } catch (error) {
    console.error("Error in addToWishlist", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};



// Remove Item from Partner Wishlist
exports.removeItemFromWishlist = async (req, res) => {
  try {
    const { partnerId } = req.user;
    const { itemDetailId, color } = req.body;

    // Validate required fields
    if (!itemDetailId || !color) {
      return res.status(400).json(
        apiResponse(400, false, "itemDetailsId and color are required")
      );
    }
    if (!mongoose.Types.ObjectId.isValid(itemDetailId)) {
      return res.status(400).json(
        apiResponse(400, false, "Invalid itemDetailsId")
      );
    }

    const wishlist = await PartnerWishlist.findOne({ partnerId: partnerId });
    if (!wishlist) {
      return res.status(404).json(
        apiResponse(404, false, "Wishlist not found")
      );
    }

    const initialLength = wishlist.items.length;
    wishlist.items = wishlist.items.filter(
      (i) => !(i.itemDetailId.toString() === itemDetailId && i.color === color)
    );

    if (initialLength === wishlist.items.length) {
      return res.status(404).json(
        apiResponse(404, false, "Item not found in wishlist")
      );
    }

    await wishlist.save();

    res.status(200).json(
      apiResponse(200, true, "Item removed from wishlist", wishlist)
    );
  } catch (error) {
    console.error("Error in removeFromWishlist", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


// Get Partner Wishlist 
exports.getPartnerWishlist = async (req, res) => {
  try {
    const { partnerId } = req.user;
 
    // Find wishlist by partner ID
    const wishlist = await PartnerWishlist.findOne({ partnerId: partnerId })

    if (!wishlist || wishlist.items.length === 0) {
      return res.status(404).json(
        apiResponse(404, false, "Wishlist is empty")
      );
    }

    res.status(200).json(
      apiResponse(200, true, "Wishlist fetched successfully", {
        items
      })
    );
  } catch (error) {
    console.error("Error in getPartnerWishlist:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};

