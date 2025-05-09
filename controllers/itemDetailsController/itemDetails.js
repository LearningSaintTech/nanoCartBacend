const mongoose = require("mongoose");
const ItemDetail = require("../../models/Items/ItemDetail");
const Item = require("../../models/Items/Item");
const { uploadMultipleImagesToS3, updateFromS3, deleteFromS3 } = require("../../utils/s3Upload");
const {apiResponse}=require("../../utils/apiResponse")



function getExtension(filename) {
  // Match the file extension using a regular expression (after the last dot in the filename)
  const match = filename && filename.match(/(\.[^\.]+)$/);
  
  if (match) {
    return match[0]; // Return the file extension (e.g., .jpg, .png)
  } else {
    throw new Error("Invalid file name or extension not found.");
  }
}


exports.createItemDetail = async (req, res) => {
  try {
    // console.log("Starting createItemDetail");
    // console.log("Request body:", req.body);
    // console.log("Uploaded files:", req.files);

    
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
      const fieldColor = file.fieldname.toLowerCase(); // Normalize to lowercase
      if (!filesByColor[fieldColor]) filesByColor[fieldColor] = [];
      filesByColor[fieldColor].push(file);
    }
    console.log("Files by color (lowercase keys):", filesByColor);

    // Process each color block
    const finalImagesByColor = [];
    for (const colorBlock of parsedImagesByColor) {
      const { color, sizes } = colorBlock;
      if (!color) {
        return res.status(400).json(apiResponse(400, false, "Each color block must include a color field."));
      }

      const normalizedColor = color.toLowerCase(); // Normalize to lowercase for matching
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

        console.log(`Uploading ${files.length} files for color ${color} to S3...`);
        const uploadedUrls = await uploadMultipleImagesToS3(renamedFiles, folderName);
        images = uploadedUrls.map((url, idx) => ({ url, priority: idx + 1 }));
      } else {
        console.log(`No files provided for color: ${color}, using empty images array`);
      }

      finalImagesByColor.push({
        color, // Retain original casing from imagesByColor
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

    console.log("Saving ItemDetail...");
    await itemDetail.save();

    console.log("Updating Item isItemDetail flag...");
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
    console.log("Starting updateItemDetail");
    console.log("Request body:", req.body);
    console.log("Uploaded files:", req.files);

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
      console.log("Files by color:", filesByColor);

      for (const colorBlock of parsedImagesByColor) {
        const { color, sizes } = colorBlock;
        if (!color) {
          return res.status(400).json(apiResponse(400, false, "Color is required in imagesByColor"));
        }

        const files = filesByColor[color] || [];
        const existingColorData = itemDetail.imagesByColor.find((entry) => entry.color === color) || { images: [], sizes: [] };

        if (files.length > 5) {
          return res.status(400).json(apiResponse(400, false, `Maximum 5 images allowed per color: ${color}`));
        }

        const folderPath = `Nanocart/categories/${categoryId}/subCategories/${subCategoryId}/item/${itemId}/itemDetails/${itemDetailsId}/${color}`;
        let finalImages = [...existingColorData.images];

        if (files.length > 0) {
          // Delete previous images from S3
          for (const image of existingColorData.images) {
            console.log(`Deleting S3 image: ${image.url}`);
            await deleteFromS3(image.url);
          }

          // Upload new images
          const renamedFiles = files.map((file, idx) => ({
            ...file,
            originalname: `${color}_image_${idx + 1}${getExtension(file.originalname)}`,
          }));

          console.log(`Uploading ${files.length} files for color ${color} to S3...`);
          const uploadedUrls = await uploadMultipleImagesToS3(renamedFiles, folderPath);
          finalImages = uploadedUrls.map((url, idx) => ({
            url,
            priority: idx + 1,
          }));
        } else {
          console.log(`No files provided for color: ${color}, retaining existing images`);
        }

        newImagesByColor.push({
          color,
          images: finalImages,
          sizes: sizes || existingColorData.sizes,
        });
      }

      updateObject.imagesByColor = newImagesByColor;
    }

    // Update item detail
    console.log("Updating ItemDetail...");
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



//get itemDetails by itemdetailsId
exports.getItemDetailById = async (req, res) => {
  try {
    const { itemDetailsId } = req.params;

    const itemDetail = await ItemDetail.findById(itemDetailsId).populate("itemId");
    console.log("itemDetail->",itemDetail)
    if (!itemDetail) {
      return res.status(404).json({ message: "ItemDetail not found." });
    }

    res.status(200).json({
      message: "ItemDetail fetched successfully.",
      data: itemDetail,
    });
  } catch (error) {
    console.error("Error in getItemDetailById:", error);
    res.status(500).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};


// //get ItemDetails by ItemId
// exports.getItemDetailsByItemId = async (req, res) => {
//   try {
//     const { itemId } = req.params;

//     if (!itemId) {
//       return res.status(400).json({ message: "itemId is required in request body." });
//     }

//     const itemDetails = await ItemDetail.find({ itemId: itemId }).populate("itemId");

//     if (!itemDetails || itemDetails.length === 0) {
//       return res.status(404).json({ message: "No item details found for this item." });
//     }

//     res.status(200).json({
//       message: "Item details fetched successfully.",
//       data: itemDetails,
//     });
//   } catch (error) {
//     console.error("Error in getItemDetailsByItemId:", error);
//     res.status(500).json({
//       message: "Internal server error.",
//       error: error.message,
//     });
//   }
// };



// Controller to get ItemDetails by ItemId and extract colors
exports.getItemDetailsByItemId = async (req, res) => {
  try {
    const { itemId } = req.params;

    // Validate itemId
    if (!itemId) {
      return res.status(400).json(apiResponse(400, false, 'itemId is required in request parameters'));
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid itemId format'));
    }

    // Fetch item details and populate itemId
    const itemDetails = await ItemDetail.find({ itemId }).populate('itemId');

    if (!itemDetails || itemDetails.length === 0) {
      return res.status(404).json(apiResponse(404, false, 'No item details found for this item'));
    }

    // Extract colors from imagesByColor for each item detail
    const colors = itemDetails.reduce((acc, detail) => {
      if (detail.imagesByColor && Array.isArray(detail.imagesByColor)) {
        const detailColors = detail.imagesByColor
          .map((entry) => entry.color)
          .filter((color) => color); // Filter out null/undefined colors
        return [...acc, ...detailColors];
      }
      return acc;
    }, []);

    // Remove duplicates (if any) and sort colors
    const uniqueColors = [...new Set(colors)].sort();

    // Send successful response
    return res.status(200).json(
      apiResponse(200, true, 'Item details and colors fetched successfully', {
        itemDetails,
        colors: uniqueColors,
      })
    );
  } catch (error) {
    console.error('Error in getItemDetailsByItemId:', error);
    return res.status(500).json(
      apiResponse(500, false, 'An error occurred while fetching item details', { error: error.message })
    );
  }
};

// Utility function to get file extension
function getExtension(filename) {
  return filename.slice(filename.lastIndexOf("."));
}