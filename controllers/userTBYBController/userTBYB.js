const UserTBYB = require("../../models/User/UserTBYB");
const {uploadImageToS3} = require("../../utils/s3Upload");
const {apiResponse}=require("../../utils/apiResponse")


exports.uploadTBYBImage = async (req, res) => {
  try {
    const { userId } = req.user;

    if (!req.file) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Image file is required"));
    }

    // 1. Check if TBYB record exists
    let userTBYB = await UserTBYB.findOne({ userId });

    // 2. If not, create it and save
    if (!userTBYB) {
      userTBYB = new UserTBYB({ userId, images: [] });
      await userTBYB.save(); // This gives us the _id for folder name
    }

    const TBYBId = userTBYB._id.toString();

    // 3. Construct folder name
    const folderName = `Nanocart/user/${userId}/TBYB/${TBYBId}/normalImage`;

    // 4. Upload image
    const normalImageUrl = await uploadImageToS3(req.file, folderName);

    // // 5. Dummy TBYB image logic (replace with real logic later)
    // const tbybImageUrl = normalImageUrl + "?tbyb=true";

    const newImage = {
      normalImage: normalImageUrl,
      // TBYBImage: tbybImageUrl,
    };

    // 6. Save image info in DB
    userTBYB.images.push(newImage);
    await userTBYB.save();

    return res.status(200).json(
      apiResponse(200, true, "Image uploaded and stored successfully", {
        normalImage: normalImageUrl,
      })
    );
  } catch (error) {
    console.error("Upload Error:", error);
    return res
      .status(500)
      .json(apiResponse(500, false, "Image upload failed", error.message));
  }
};




exports.getTBYBImages = async (req, res) => {
  try {
    const {userId} = req.user

    const tbybDoc = await UserTBYB.findOne({ userId });

    if (!tbybDoc || tbybDoc.images.length === 0) {
      return res.status(200).json(apiResponse(200, true, "No images found", []));
    }

    return res.status(200).json(
      apiResponse(200, true, "Images fetched successfully", tbybDoc)
    );
  } catch (error) {
    console.error("Error fetching TBYB images:", error);
    return res.status(500).json(
      apiResponse(500, false, "Internal server error", error.message)
    );
  }
};

