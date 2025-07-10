
const UserTBYB = require("../../models/User/UserTBYB");
const mongoose=require("mongoose")
exports.createTBYBEntry = async (req, res) => {
  try {
    console.log("Received request body:", req.body); // Log to debug
    const { userId } = req.user; 
    const { images } = req.body;

    // Validate images array
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Images array is required and cannot be empty.",
        receivedBody: req.body, // Include for debugging
      });
    }

    // Validate each image entry
    for (const image of images) {
      if (!image.itemId || !mongoose.Types.ObjectId.isValid(image.itemId)) {
        return res.status(400).json({
          success: false,
          message: `Invalid or missing itemId in images array: ${image.itemId || 'missing'}`,
        });
      }
      if (!image.tbybImageUrl || !Array.isArray(image.tbybImageUrl) || image.tbybImageUrl.length === 0) {
        return res.status(400).json({
          success: false,
          message: `tbybImageUrl must be a non-empty array for itemId: ${image.itemId}`,
        });
      }
    }

    const newEntry = new UserTBYB({
      userId,
      images,
    });

    const savedEntry = await newEntry.save();

    return res.status(201).json({
      success: true,
      message: "TBYB entry created successfully.",
      data: savedEntry,
    });
  } catch (error) {
    console.error("TBYB create error:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};