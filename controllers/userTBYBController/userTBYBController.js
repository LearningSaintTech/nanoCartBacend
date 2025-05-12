const mongoose = require("mongoose");
const UserTBYB = require("../../models/User/UserTBYB");
const ItemDetail = require("../../models/Items/ItemDetail");
const Item = require("../../models/Items/Item");
const axios = require("axios");
const { uploadImageToS3 } = require("../../utils/s3Upload");
const {apiResponse}=require("../../utils/apiResponse")

// Utility function to poll prediction status
const pollPredictionStatus = async (predictionId, apiKey) => {
  const maxAttempts = 12; // 60 seconds / 5 seconds per attempt
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusResponse = await axios.get(
      `https://api.fashn.ai/v1/status/${predictionId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const { status, output, error } = statusResponse.data;

    if (status === "completed" && output && output.length > 0) {
      return output[0]; // Return the first output URL
    }

    if (status === "failed" || error) {
      throw new Error(error || "Prediction failed");
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("Prediction timeout: Maximum polling attempts reached");
};

exports.generateTBYBImage = async (req, res) => {
  try {
    const { userId } = req.user;
    console.log(userId)
    console.log(req.body)
    const { itemId, color } = req.body;
    console.log(req.file)
 

    // Validate inputs
    if (!userId || !itemId || !color) {
      return res.status(400).json(
        apiResponse(400, false, "Missing required fields or user image")
      );
    }

    // Fetch item and populate subCategory
    const item = await Item.findById(itemId).populate("subCategoryId");
    if (!item) {
      return res.status(404).json(
        apiResponse(404, false, "Item not found")
      );
    }
    const subCategory = item.subCategoryId.name;
    if (!subCategory) {
      return res.status(400).json(
        apiResponse(400, false, "Subcategory not defined for this item")
      );
    }

    // Fetch item image from ItemDetail
    const itemDetail = await ItemDetail.findOne({ itemId });
    if (!itemDetail) {
      return res.status(404).json(
        apiResponse(404, false, "Item details not found")
      );
    }

    const colorData = itemDetail.imagesByColor.find(
      (img) => img.color.toLowerCase() === color.toLowerCase()
    );
    if (!colorData) {
      return res.status(400).json(
        apiResponse(400, false, "Color not available for this item")
      );
    }

    const itemImageUrl = colorData.images[0].url;
    if (!itemImageUrl) {
      return res.status(400).json(
        apiResponse(400, false, "No image available for the selected color")
      );
    }

    // Upload user image to S3
    const folderName=`NanoCart/user/${userId}/image`
    const userImageUrl = await uploadImageToS3(req.file, folderName);
    console.log(userImageUrl)

    // Call the external API to initiate TBYB image generation
    const apiResponseData = await axios.post(
      "https://api.fashn.ai/v1/run",
      {
        model_image: userImageUrl,
        garment_image: itemImageUrl,
        category: subCategory.toLowerCase(),
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FASHN_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const predictionId = apiResponseData.data.id;
    if (!predictionId) {
      return res.status(500).json(
        apiResponse(500, false, "Failed to initiate TBYB image generation")
      );
    }

    // Poll for prediction status
    const TBYBImageUrl = await pollPredictionStatus(
      predictionId,
      process.env.FASHN_API_KEY
    );

    // Check if UserTBYB document exists
    let tbyb = await UserTBYB.findOne({ userId });

    const newImage = {
      itemImage: itemImageUrl,
      userImage: userImageUrl,
      TBYBImage: TBYBImageUrl,
      uploadedAt: new Date(),
    };

    if (!tbyb) {
      // Create new document if it doesn't exist
      tbyb = await UserTBYB.create({
        userId,
        images: [newImage],
        trialOnNumber: 1,
      });
    } else {
      // Check if trialOnNumber is at max
      if (tbyb.trialOnNumber >= 10) {
        return res.status(403).json(
          apiResponse(403, false, "Maximum trial limit reached (10 trials)", {
            images: newImage,
            trialOnNumber: 10,
          })
        );
      }

      // Update existing document
      tbyb = await UserTBYB.findOneAndUpdate(
        { userId },
        {
          $push: { images: newImage },
          $inc: { trialOnNumber: 1 }, // Increment trialOnNumber
        },
        { new: true }
      );
    }

    // Return all images
    return res.status(200).json(
      apiResponse(200, true, "TBYB image generated successfully", {
        images: tbyb.images[tbyb.images.length - 1],
        trialOnNumber: tbyb.trialOnNumber,
      })
    );
  } catch (error) {
    console.error("Error in generateTBYBImage:", error);
    return res.status(500).json(
      apiResponse(500, false, "Internal server error", error.message)
    );
  }
};