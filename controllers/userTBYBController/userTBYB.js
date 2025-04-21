const TBYB = require("../../models/User/UserTBYB");
const uploadImageToS3 = require("../../utils/s3Upload");

exports.uploadTBYBImage = async (req, res) => {
  try {
    
  } catch (error) {
    
  }
};





exports.getTBYBImages = async (req, res) => {
  try {
    const userId = req.user._id;

    const tbybDoc = await TBYB.findOne({ userId });

    if (!tbybDoc || tbybDoc.images.length === 0) {
      return res.status(200).json(apiResponse(200, true, "No images found", []));
    }

    return res.status(200).json(
      apiResponse(200, true, "Images fetched successfully", tbybDoc.images)
    );
  } catch (error) {
    console.error("Error fetching TBYB images:", error);
    return res.status(500).json(
      apiResponse(500, false, "Internal server error", error.message)
    );
  }
};
