const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  uploadBanner,
  deleteBanner,
  updateBanner,
  getAllBanners,
  getBannerById,
} = require("../../controllers/homePageBannerController/homePageBanner");
const {isAdmin } = require("../../middlewares/isAdmin");
const {verifyToken}=require("../../middlewares/verifyToken")

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(file.originalname.split(".").pop().toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only .png, .jpg and .jpeg format allowed!"));
  },
});

// Routes
router.post("/upload",verifyToken,isAdmin, upload.single("bannerImage"), uploadBanner);
router.delete("/:id",verifyToken,isAdmin, deleteBanner);
router.put("/:id", verifyToken,isAdmin,upload.single("bannerImage"), updateBanner);
router.get("/", getAllBanners);
router.get("/:id", getBannerById);

module.exports = router;