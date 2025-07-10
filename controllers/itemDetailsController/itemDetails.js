const mongoose = require("mongoose");
const ItemDetail = require("../../models/Items/ItemDetail");
const Item = require("../../models/Items/Item");
const { uploadMultipleImagesToS3, deleteFromS3 } = require("../../utils/s3Upload");
const { apiResponse } = require("../../utils/apiResponse");

// Utility function to get file extension
function getExtension(filename) {
  const match = filename && filename.match(/(\.[^\.]+)$/);
  if (match) {
    return match[0];
  }
  throw new Error("Invalid file name or extension not found.");
}

exports.createItemDetail = async (req, res) => {
  try {
    const {
      itemId,
      imagesByColor,
      sizeChart,
      howToMeasure,
      isSize,
      isMultipleColor,
      deliveryDescription,
      About,
      PPQ,
      deliveryPincode,
      returnPolicy,
    } = req.body;


    console.log(req.file);
    // Safe JSON parse helper
    const safeParse = (data, name) => {
      if (typeof data === "string") {
        try {
          return JSON.parse(data);
        } catch (err) {
          throw new Error(`Invalid JSON in ${name}`);
        }
      }
      return data || [];
    };

    const parsedImagesByColor = safeParse(imagesByColor, "imagesByColor");
    const parsedSizeChart = safeParse(sizeChart, "sizeChart");
    const parsedHowToMeasure = safeParse(howToMeasure, "howToMeasure");
    const parsedPPQ = safeParse(PPQ, "PPQ");
    const parsedPincodes = safeParse(deliveryPincode, "deliveryPincode")
      .map((p) => Number(p))
      .filter((p) => !isNaN(p));

    // Validate required fields
    if (!itemId || !parsedImagesByColor.length) {
      return res.status(400).json(apiResponse(400, false, "itemId and imagesByColor are required."));
    }

    // Validate itemId
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemId format."));
    }

    // Fetch and validate the Item document
    const itemDoc = await Item.findById(itemId);
    if (!itemDoc) {
      return res.status(404).json(apiResponse(404, false, "Item not found."));
    }

    // Check if an ItemDetail already exists for this itemId
    const existingItemDetail = await ItemDetail.findOne({ itemId });
    if (existingItemDetail) {
      return res.status(400).json(apiResponse(400, false, "ItemDetail already exists for this item."));
    }

    const itemDetailsId = new mongoose.Types.ObjectId();

    // Group uploaded images by fieldname (color), using lowercase for case-insensitive matching
    const filesByColor = {};
    for (const file of req.files || []) {
      const fieldColor = file.fieldname.toLowerCase();
      if (!filesByColor[fieldColor]) filesByColor[fieldColor] = [];
      filesByColor[fieldColor].push(file);
    }

    // Process each color block
    const finalImagesByColor = [];
    for (const colorBlock of parsedImagesByColor) {
      const { color, hexCode, sizes } = colorBlock;
      if (!color) {
        return res.status(400).json(apiResponse(400, false, "Each color block must include a color field."));
      }

      const normalizedColor = color.toLowerCase();
      const files = filesByColor[normalizedColor] || [];
      let images = [];

      if (files.length > 5) {
        return res.status(400).json(apiResponse(400, false, `Maximum 5 images allowed per color: ${color}`));
      }

      if (files.length > 0) {
        const folderName = `Nanocart/categories/${itemDoc.categoryId}/subCategories/${itemDoc.subCategoryId}/item/${itemId}/itemDetails/${itemDetailsId}/${color}`;
        const renamedFiles = files.map((file, idx) => {
          try {
            return {
              ...file,
              originalname: `${color}_image_${idx + 1}${getExtension(file.originalname)}`,
            };
          } catch (err) {
            throw new Error(`Failed to process file ${file.originalname}: ${err.message}`);
          }
        });

        const uploadedUrls = await uploadMultipleImagesToS3(renamedFiles, folderName);
        images = uploadedUrls.map((url, idx) => ({ url, priority: idx + 1 }));
      }

      finalImagesByColor.push({
        color,
        hexCode: hexCode || null, // Include hexCode, default to null if not provided
        images,
        sizes: sizes || [],
      });
    }

    // Construct the item detail
    const itemDetail = new ItemDetail({
      _id: itemDetailsId,
      itemId,
      imagesByColor: finalImagesByColor,
      sizeChart: parsedSizeChart,
      howToMeasure: parsedHowToMeasure,
      isSize: isSize === "true" || isSize === true,
      isMultipleColor: isMultipleColor === "true" || isMultipleColor === true,
      deliveryDescription: deliveryDescription || "",
      About: About || "",
      PPQ: parsedPPQ,
      deliveryPincode: parsedPincodes,
      returnPolicy: returnPolicy || "30-day return policy available.",
    });

    await itemDetail.save();

    itemDoc.isItemDetail = true;
    await itemDoc.save();

    return res.status(201).json(apiResponse(201, true, "ItemDetail created successfully", itemDetail));
  } catch (error) {
    console.error("Error creating item detail:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
      files: req.files,
    });
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

exports.updateItemDetail = async (req, res) => {
  try {
    const { itemDetailsId } = req.params;
    const {
      imagesByColor,
      sizeChart,
      howToMeasure,
      isSize,
      isMultipleColor,
      deliveryDescription,
      About,
      PPQ,
      deliveryPincode,
      returnPolicy,
    } = req.body;

    // Validate itemDetailsId
    if (!mongoose.Types.ObjectId.isValid(itemDetailsId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemDetailsId format."));
    }

    // Find item detail and populate the item reference
    const itemDetail = await ItemDetail.findById(itemDetailsId).populate("itemId");
    if (!itemDetail) {
      return res.status(404).json(apiResponse(404, false, "ItemDetail not found"));
    }

    // Safe JSON parse helper
    const safeParse = (value, name) => {
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch (err) {
          throw new Error(`Invalid JSON in ${name}`);
        }
      }
      return value || [];
    };

    // Parse fields
    const parsedImagesByColor = safeParse(imagesByColor, "imagesByColor");
    const parsedSizeChart = safeParse(sizeChart, "sizeChart");
    const parsedHowToMeasure = safeParse(howToMeasure, "howToMeasure");
    const parsedPPQ = safeParse(PPQ, "PPQ");
    const parsedPincodes = safeParse(deliveryPincode, "deliveryPincode")
      .map((p) => Number(p))
      .filter((p) => !isNaN(p));

    // Build update object
    const updateObject = {
      ...(About !== undefined && { About }),
      ...(returnPolicy !== undefined && { returnPolicy }),
      ...(parsedPPQ.length && { PPQ: parsedPPQ }),
      ...(parsedPincodes.length && { deliveryPincode: parsedPincodes }),
      ...(parsedSizeChart.length && { sizeChart: parsedSizeChart }),
      ...(parsedHowToMeasure.length && { howToMeasure: parsedHowToMeasure }),
      ...(deliveryDescription !== undefined && { deliveryDescription }),
      ...(isSize !== undefined && { isSize: isSize === "true" || isSize === true }),
      ...(isMultipleColor !== undefined && { isMultipleColor: isMultipleColor === "true" || isMultipleColor === true }),
    };

    // Update imagesByColor
    if (parsedImagesByColor.length) {
      const newImagesByColor = [];
      const categoryId = itemDetail.itemId.categoryId;
      const subCategoryId = itemDetail.itemId.subCategoryId;
      const itemId = itemDetail.itemId._id;

      // Group uploaded images by fieldname (color)
      const filesByColor = {};
      for (const file of req.files || []) {
        const colorKey = file.fieldname;
        if (!filesByColor[colorKey]) filesByColor[colorKey] = [];
        filesByColor[colorKey].push(file);
      }

      for (const colorBlock of parsedImagesByColor) {
        const { color, hexCode, sizes } = colorBlock;
        if (!color) {
          return res.status(400).json(apiResponse(400, false, "Color is required in imagesByColor"));
        }

        const files = filesByColor[color] || [];
        const existingColorData = itemDetail.imagesByColor.find((entry) => entry.color === color) || { images: [], sizes: [], hexCode: null };

        if (files.length > 5) {
          return res.status(400).json(apiResponse(400, false, `Maximum 5 images allowed per color: ${color}`));
        }

        const folderPath = `Nanocart/categories/${categoryId}/subCategories/${subCategoryId}/item/${itemId}/itemDetails/${itemDetailsId}/${color}`;
        let finalImages = [...existingColorData.images];

        if (files.length > 0) {
          // Delete previous images from S3
          for (const image of existingColorData.images) {
            await deleteFromS3(image.url);
          }

          // Upload new images
          const renamedFiles = files.map((file, idx) => ({
            ...file,
            originalname: `${color}_image_${idx + 1}${getExtension(file.originalname)}`,
          }));

          const uploadedUrls = await uploadMultipleImagesToS3(renamedFiles, folderPath);
          finalImages = uploadedUrls.map((url, idx) => ({
            url,
            priority: idx + 1,
          }));
        }

        newImagesByColor.push({
          color,
          hexCode: hexCode || existingColorData.hexCode || null, // Retain existing or update hexCode
          images: finalImages,
          sizes: sizes || existingColorData.sizes,
        });
      }

      updateObject.imagesByColor = newImagesByColor;
    }

    // Update item detail
    const updatedItemDetail = await ItemDetail.findByIdAndUpdate(
      itemDetailsId,
      { $set: updateObject },
      { new: true }
    );

    return res.status(200).json(apiResponse(200, true, "ItemDetail updated successfully", updatedItemDetail));
  } catch (error) {
    console.error("Error updating item detail:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
      files: req.files,
    });
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

exports.deleteItemDetail = async (req, res) => {
  try {
    const { itemDetailsId } = req.params;

    // Validate itemDetailsId
    if (!mongoose.Types.ObjectId.isValid(itemDetailsId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid ItemDetail ID"));
    }

    // Find item detail
    const itemDetail = await ItemDetail.findById(itemDetailsId);
    if (!itemDetail) {
      return res.status(404).json(apiResponse(404, false, "ItemDetail not found"));
    }

    // Delete images from S3
    for (const colorObj of itemDetail.imagesByColor || []) {
      for (const image of colorObj.images || []) {
        await deleteFromS3(image.url);
      }
    }

    // Delete item detail
    await ItemDetail.findByIdAndDelete(itemDetailsId);

    // Update the Item's isItemDetail flag
    await Item.findByIdAndUpdate(itemDetail.itemId, { isItemDetail: false });

    return res.status(200).json(apiResponse(200, true, "ItemDetail deleted successfully"));
  } catch (error) {
    console.error("Error deleting item detail:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

exports.getItemDetailById = async (req, res) => {
  try {
    const { itemDetailsId } = req.params;

    // Validate itemDetailsId
    if (!mongoose.Types.ObjectId.isValid(itemDetailsId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemDetailsId format"));
    }

    // Fetch item detail and populate itemId
    const itemDetail = await ItemDetail.findById(itemDetailsId).populate("itemId");
    if (!itemDetail) {
      return res.status(404).json(apiResponse(404, false, "ItemDetail not found"));
    }

    return res.status(200).json(
      apiResponse(200, true, "ItemDetail fetched successfully", itemDetail)
    );
  } catch (error) {
    console.error("Error in getItemDetailById:", error);
    return res.status(500).json(
      apiResponse(500, false, "An error occurred while fetching item detail", { error: error.message })
    );
  }
};

exports.getItemDetailsByItemId = async (req, res) => {
  try {
    const { itemId } = req.params;

    // Validate itemId
    if (!itemId) {
      return res.status(400).json(apiResponse(400, false, "itemId is required in request parameters"));
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemId format"));
    }

    // Fetch item details and populate itemId
    const itemDetails = await ItemDetail.find({ itemId }).populate("itemId");

    if (!itemDetails || itemDetails.length === 0) {
      return res.status(404).json(apiResponse(404, false, "No item details found for this item"));
    }

    // Extract colors and hexCodes from imagesByColor for each item detail
    const colors = itemDetails.reduce((acc, detail) => {
      if (detail.imagesByColor && Array.isArray(detail.imagesByColor)) {
        const detailColors = detail.imagesByColor
          .map((entry) => ({
            color: entry.color,
            hexCode: entry.hexCode || null,
          }))
          .filter((item) => item.color); // Filter out entries with null/undefined color
        return [...acc, ...detailColors];
      }
      return acc;
    }, []);

    // Remove duplicates based on color and sort
    const uniqueColors = Array.from(
      new Map(colors.map((item) => [item.color, item])).values()
    ).sort((a, b) => a.color.localeCompare(b.color));

    // Send successful response
    return res.status(200).json({
      message: "Item details fetched successfully.",
      data: itemDetails,
      colors: uniqueColors,
    });
    
  } catch (error) {
    console.error("Error in getItemDetailsByItemId:", error);
    return res.status(500).json(
      apiResponse(500, false, "An error occurred while fetching item details", { error: error.message })
    );
  }
};

exports.bulkUploadItemDetailsFromFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(apiResponse(400, false, "No file uploaded."));
    }

    const fileContent = req.file.buffer.toString("utf-8");
    let itemDetails;

    try {
      itemDetails = JSON.parse(fileContent);
    } catch (err) {
      return res.status(400).json(apiResponse(400, false, "Invalid JSON format."));
    }

    if (!Array.isArray(itemDetails)) {
      return res.status(400).json(apiResponse(400, false, "JSON should be an array of ItemDetails."));
    }

    const itemIdsToUpdate = new Set();

    for (const [index, detail] of itemDetails.entries()) {
      if (!detail.itemId) {
        return res.status(400).json(apiResponse(400, false, `Missing itemId at index ${index}`));
      }

      const exists = await Item.exists({ _id: detail.itemId });
      if (!exists) {
        return res.status(400).json(
          apiResponse(400, false, `ItemId '${detail.itemId}' at index ${index} does not exist.`)
        );
      }

      itemIdsToUpdate.add(detail.itemId);

      // Clean up any image entries missing required fields
      if (detail.imagesByColor && Array.isArray(detail.imagesByColor)) {
        detail.imagesByColor.forEach(colorEntry => {
          if (colorEntry.images && Array.isArray(colorEntry.images)) {
            colorEntry.images = colorEntry.images.map(img => ({
              itemDetailImageId: img.itemDetailImageId,
              priority: img.priority
              // url is omitted by design
            }));
          }
        });
      }
    }

    // Insert ItemDetails
    const inserted = await ItemDetail.insertMany(itemDetails);

    // Update isItemDetail = true for all involved Items
    await Item.updateMany(
      { _id: { $in: Array.from(itemIdsToUpdate) } },
      { $set: { isItemDetail: true } }
    );

    return res.status(201).json(
      apiResponse(201, true, `${inserted.length} ItemDetails uploaded and Items updated.`, inserted)
    );
  } catch (error) {
    console.error("ItemDetail Bulk Upload Error:", error);
    return res.status(500).json(apiResponse(500, false, "Internal Server Error."));
  }
};
exports.bulkUploadItemDetailImages = async (req, res) => {
  try {
    const { itemDetailId } = req.body;
    // console.log("Uploaded files:", req.files);

    // Validate input
    if (!itemDetailId || !req.files || req.files.length === 0) {
      return res.status(400).json(
        apiResponse(400, false, "Missing itemDetailId or image files.")
      );
    }

    // Find item detail
    const itemDetail = await ItemDetail.findById(itemDetailId);
    if (!itemDetail) {
      return res.status(404).json(
        apiResponse(404, false, "ItemDetail not found.")
      );
    }

    const uploadResults = [];
    const errors = [];

    // Process each file
    const uploadPromises = req.files.map(async (file) => {
      const itemDetailImageId = file.originalname.split(".")[0];
      let matched = false;
      let uploadedImageUrl = null;

      // Search for matching image in imagesByColor
      for (const colorEntry of itemDetail.imagesByColor) {
        const imageEntry = colorEntry.images.find(
          (img) => img.itemDetailImageId === itemDetailImageId
        );

        if (imageEntry) {
          const folderPath = `Nanocart/items/${itemDetail._id}/colors/${colorEntry.color}`;
          try {
            const uploadResult = await uploadMultipleImagesToS3([file], folderPath);
            imageEntry.url = uploadResult[0];
            uploadedImageUrl = uploadResult[0];
            matched = true;
          } catch (uploadError) {
            errors.push(
              `Failed to upload image for itemDetailImageId: ${itemDetailImageId} - ${uploadError.message}`
            );
            return null;
          }
          break;
        }
      }

      if (!matched) {
        errors.push(
          `No matching image found with itemDetailImageId: ${itemDetailImageId}`
        );
        return null;
      }

      return { itemDetailImageId, url: uploadedImageUrl };
    });

    // Wait for all uploads to complete
    uploadResults.push(
      ...(await Promise.all(uploadPromises)).filter((result) => result !== null)
    );

    // Handle errors
    if (errors.length > 0) {
      return res.status(400).json(
        apiResponse(400, false, "Some images could not be processed.", {
          errors,
          uploaded: uploadResults,
        })
      );
    }

    // Save updated item detail
    const updatedItemDetail = await itemDetail.save();

    // Send success response
    return res.status(200).json(
      apiResponse(200, true, "Images uploaded and mapped successfully.", {
        updatedItemDetail,
      })
    );
  } catch (error) {
    console.error("ItemDetail Image Bulk Upload Error:", error);
    return res.status(500).json(
      apiResponse(500, false, "Internal Server Error.")
    );
  }
};


// Utility to convert a string to MongoDB ObjectId
const toObjectId = (id) => {
  try {
    if (!id || typeof id !== "string") {
      throw new Error("ID must be a non-empty string.");
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid ObjectId format.");
    }
    return new mongoose.Types.ObjectId(id);
  } catch (error) {
    throw new Error(`Failed to convert to ObjectId: ${error.message}`);
  }
};

//For Admin Controller
// Update stock for a specific itemDetailId and skuId
exports.updateStock = async (req, res) => {
  try {
    const {itemDetailId}=req.params;
    const { skuId, stock } = req.body;

    // Validate input
    if (!itemDetailId || !skuId || stock === undefined) {
      return res.status(400).json(apiResponse(400, false, "itemDetailId, skuId, and stock are required."));
    }

    let objectId;
    try {
      objectId = toObjectId(itemDetailId);
    } catch (error) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemDetailId format."));
    }

    if (typeof stock !== "number" || stock < 0) {
      return res.status(400).json(apiResponse(400, false, "Stock must be a non-negative number."));
    }

    // Find ItemDetail
    const itemDetail = await ItemDetail.findById(objectId);
    if (!itemDetail) {
      return res.status(404).json(apiResponse(404, false, "ItemDetail not found."));
    }

    // Find and update the specific SKU in imagesByColor
    let skuFound = false;
    for (const colorEntry of itemDetail.imagesByColor) {
      const sizeEntry = colorEntry.sizes.find((size) => size.skuId === skuId);
      if (sizeEntry) {
        sizeEntry.stock += stock; // Increment stock
        sizeEntry.isOutOfStock = sizeEntry.stock === 0; // Update isOutOfStock
        skuFound = true;
        break;
      }
    }

    if (!skuFound) {
      return res.status(404).json(apiResponse(404, false, "SKU not found for this ItemDetail."));
    }

    // Save updated ItemDetail
    await itemDetail.save();

    return res.status(200).json(
      apiResponse(200, true, "Stock updated successfully.", {
        itemDetailId,
        skuId,
        stock: itemDetail.imagesByColor.find((entry) => entry.sizes.some((size) => size.skuId === skuId)).sizes.find((size) => size.skuId === skuId).stock,
      })
    );
  } catch (error) {
    console.error("Error updating stock:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });
    return res.status(500).json(apiResponse(500, false, "An error occurred while updating stock."));
  }
};

// Fetch stock details for a specific itemDetailId and skuId
exports.getStockDetails = async (req, res) => {
  try {
    const { itemDetailId, skuId } = req.params;

    // Validate input
    if (!itemDetailId || !skuId) {
      return res.status(400).json(apiResponse(400, false, "itemDetailId and skuId are required."));
    }

    let objectId;
    try {
      objectId = toObjectId(itemDetailId);
    } catch (error) {
      return res.status(400).json(apiResponse(400, false, "Invalid itemDetailId format."));
    }

    // Find ItemDetail
    const itemDetail = await ItemDetail.findById(objectId).populate("itemId");
    if (!itemDetail) {
      return res.status(404).json(apiResponse(404, false, "ItemDetail not found."));
    }

    // Find the specific SKU in imagesByColor
    let stockDetails = null;
    for (const colorEntry of itemDetail.imagesByColor) {
      const sizeEntry = colorEntry.sizes.find((size) => size.skuId === skuId);
      if (sizeEntry) {
        stockDetails = {
          itemDetailId,
          skuId,
          color: colorEntry.color,
          size: sizeEntry.size,
          stock: sizeEntry.stock,
          isOutOfStock: sizeEntry.isOutOfStock,
        };
        break;
      }
    }

    if (!stockDetails) {
      return res.status(404).json(apiResponse(404, false, "SKU not found for this ItemDetail."));
    }

    return res.status(200).json(apiResponse(200, true, "Stock details fetched successfully.", stockDetails));
  } catch (error) {
    console.error("Error fetching stock details:", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json(apiResponse(500, false, "An error occurred while fetching stock details."));
  }
};

exports.updateTbybStatus = async (req, res) => {
  try {
    const {itemDetailId} = req.params;
    const {color, imageId} = req.body;

    // Validate required fields
    if (!itemDetailId || !color || !imageId) {
      return res.status(400).json({ 
        success: false, 
        message: 'itemDetailId, color, and imageId are required' 
      });
    }

    // Find and update the item detail
    const itemDetail = await ItemDetail.findById(itemDetailId);
    
    if (!itemDetail) {
      return res.status(404).json({ 
        success: false, 
        message: 'Item detail not found' 
      });
    }

    // Find the color entry
    const colorEntry = itemDetail.imagesByColor.find(
      entry => entry.color.toLowerCase() === color.toLowerCase()
    );

    if (!colorEntry) {
      return res.status(404).json({ 
        success: false, 
        message: `Color ${color} not found` 
      });
    }

    // Find and update the image
    const image = colorEntry.images.find(
      img => img._id.toString() === imageId
    );

    if (!image) {
      return res.status(404).json({ 
        success: false, 
        message: 'Image not found' 
      });
    }

    // Update isTbyb to true for the specified image
    image.isTbyb = true;

    // Check and set other images' isTbyb to false if any are true
    itemDetail.imagesByColor.forEach(colorEntry => {
      colorEntry.images.forEach(img => {
        if (img._id.toString() !== imageId && img.isTbyb === true) {
          img.isTbyb = false;
        }
      });
    });

    // Save the updated document
    await itemDetail.save();

    // Prepare response with requested data
    const response = {
      success: true,
      data: {
        itemDetailId: itemDetail._id,
        color: colorEntry.color,
        imageId: image._id,
        isTbyb: image.isTbyb
      },
      itemDetail
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error updating isTbyb status:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error while updating isTbyb status',
      error: error.message 
    });
  }
};