const express = require("express");
const router = express.Router();
const multer = require("multer");

// Configure multer for file uploads
const upload = multer({ limits: { files: 20 } });

// Import controllers
const {
  createItemDetail,
  updateItemDetail,
  deleteItemDetail,
  getItemDetailsByItemId,
  getItemDetailById,
  bulkUploadItemDetailsFromFile,
  bulkUploadItemDetailImages,
  updateStock,
  getStockDetails,
  updateTbybStatus,
} = require("../../controllers/itemDetailsController/itemDetails");

// Import middleware
const { verifyToken } = require("../../middlewares/verifyToken");
const { isAdmin } = require("../../middlewares/isAdmin");

// Create a new ItemDetail (Admin only, supports multiple image uploads)
router.post(
  "/create",
  verifyToken,
  isAdmin,
  upload.any(), // Supports multiple color image uploads (e.g., red, blue)
  createItemDetail
);

// Update an existing ItemDetail by ID (Admin only, supports multiple image uploads)
router.put(
  "/:itemDetailsId",
  verifyToken,
  isAdmin,
  upload.any(), // Supports image updates along with other data
  updateItemDetail
);

// Delete an ItemDetail by ID (Admin only)
router.delete(
  "/:itemDetailsId",
  verifyToken,
  isAdmin,
  deleteItemDetail
);

// Get all ItemDetails for a specific itemId (Public access)
router.get(
  "/item/:itemId",
  getItemDetailsByItemId
);

// Get a single ItemDetail by itemDetailsId (Public access)
router.get(
  "/:itemDetailsId",
  getItemDetailById
);

// Bulk upload ItemDetails from a JSON file (Admin only)
router.post(
  "/bulk-upload",
  verifyToken,
  isAdmin,
  upload.single("file"), // Single file upload for JSON
  bulkUploadItemDetailsFromFile
);

// Bulk upload images for an ItemDetail (Admin only)
router.post(
  "/:itemDetailId/bulk-upload-images",
  verifyToken,
  isAdmin,
  upload.any(), // Supports multiple image uploads
  bulkUploadItemDetailImages
);

// Update stock for a specific itemDetailId and skuId (Admin only)
router.put(
  "/stock/:itemDetailId",
  verifyToken,
  isAdmin,
  updateStock
);

// Get stock details for a specific itemDetailId and skuId (Admin only)
router.get(
  "/stock/:itemDetailId/:skuId",
  verifyToken,
  isAdmin,
  getStockDetails
);

// Update isTbyb status for a specific image in an ItemDetail (Admin only)
router.put(
  "/tbyb/:itemDetailId",
  verifyToken,
  isAdmin,
  updateTbybStatus
);

module.exports = router;