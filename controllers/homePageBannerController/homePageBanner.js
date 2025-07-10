const HomePageBanner = require("../../models/HomePageBanner/HomePageBanner");
const { uploadImageToS3, deleteFromS3, updateFromS3 } = require("../../utils/s3Upload");

// Upload Banner Controller
const uploadBanner = async (req, res) => {
  try {
    const { bannerName } = req.body;
    console.log(req.file)
    if (!bannerName || !req.file) {
      return res.status(400).json({ message: "Banner name and image are required" });
    }
    const folderName = `Nanocart/HomePageBanner${bannerName}`;
    const bannerImageUrl = await uploadImageToS3(req.file, folderName);

    const newBanner = new HomePageBanner({
      bannerName,
      bannerImageUrl,
    });

    await newBanner.save();

    res.status(201).json({
      message: "Banner uploaded successfully",
      banner: newBanner,
    });
  } catch (error) {
    console.error("Error uploading banner:", error);
    res.status(500).json({ message: "Failed to upload banner", error: error.message });
  }
};

// Delete Banner Controller
const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await HomePageBanner.findById(id);

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    // Delete image from S3
    await deleteFromS3(banner.bannerImageUrl);

    // Delete banner from database
    await HomePageBanner.findByIdAndDelete(id);

    res.status(200).json({ message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Error deleting banner:", error);
    res.status(500).json({ message: "Failed to delete banner", error: error.message });
  }
};

// Update Banner Controller
const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { bannerName } = req.body;
    const file = req.file;

    const banner = await HomePageBanner.findById(id);
    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    // Prepare update object
    const updateData = {};
    if (bannerName) updateData.bannerName = bannerName;
    
    if (file) {
      const folderName = "banners";
      // Update image in S3
      updateData.bannerImageUrl = await updateFromS3(banner.bannerImageUrl, file, folderName);
    }

    // Update banner in database
    const updatedBanner = await HomePageBanner.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    res.status(200).json({
      message: "Banner updated successfully",
      banner: updatedBanner,
    });
  } catch (error) {
    console.error("Error updating banner:", error);
    res.status(500).json({ message: "Failed to update banner", error: error.message });
  }
};

// Get All Banners Controller
const getAllBanners = async (req, res) => {
  try {
    const banners = await HomePageBanner.find();
    res.status(200).json({
      message: "Banners retrieved successfully",
      banners,
    });
  } catch (error) {
    console.error("Error fetching banners:", error);
    res.status(500).json({ message: "Failed to fetch banners", error: error.message });
  }
};

// Get Single Banner Controller
const getBannerById = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await HomePageBanner.findById(id);

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    res.status(200).json({
      message: "Banner retrieved successfully",
      banner,
    });
  } catch (error) {
    console.error("Error fetching banner:", error);
    res.status(500).json({ message: "Failed to fetch banner", error: error.message });
  }
};

module.exports = {
  uploadBanner,
  deleteBanner,
  updateBanner,
  getAllBanners,
  getBannerById,
};