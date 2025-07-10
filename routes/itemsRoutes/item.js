const express = require("express");
const multer = require("multer");
const {
  createItem,
  updateItem,
  deleteItem,
  getAllItem,
  getItemById,
  getItemByCategoryId,
  getItemBySubCategoryId,
  getItemsByFilters,
  getSortedItems,
  searchItems,
  bulkUploadItemsFromFile,
  bulkUploadItemImages, // Import the new controller
  findItems
} = require("../../controllers/itemController/item");

const router = express.Router();

// Configure Multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit per file

const { verifyToken } = require("../../middlewares/verifyToken");
const { isAdmin } = require("../../middlewares/isAdmin");

// Create an Item
router.post("/create", verifyToken, isAdmin, upload.single("image"), createItem);

// Bulk upload items via JSON file
router.post("/bulk-upload", verifyToken, isAdmin, upload.single("file"), bulkUploadItemsFromFile);

// Bulk upload item images
router.post("/bulk-upload-images", verifyToken, isAdmin, upload.array("images"), bulkUploadItemImages);

// Update Item
router.put("/:itemId", verifyToken, isAdmin, upload.single("image"), updateItem);

// Delete Item
router.delete("/:itemId", verifyToken, isAdmin, deleteItem);

// Get All Items
router.get("/", getAllItem);

// Filtered Items
router.get("/filter", getItemsByFilters);

// GET /items?sortBy=latest OR popularity OR priceLowToHigh OR priceHighToLow OR offer
router.get("/sort", getSortedItems);

// Search the item
router.get("/search", searchItems);

// Get Items by Category ID
router.get("/category/:categoryId", getItemByCategoryId);

// Get Items by SubCategory ID
router.get("/subcategory/:subcategoryId", getItemBySubCategoryId);

// Get Single Item by ID (keep this at the end to avoid conflicts)
router.get("/:itemId", getItemById);


router.post('/filtering', findItems);


module.exports = router;