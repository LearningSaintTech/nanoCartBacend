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
  searchAndFilterItems
} = require("../../controllers/itemController/item");

const router = express.Router();

// Configure Multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

 
const {verifyToken}=require("../../middlewares/verifyToken");
const {isAdmin}=require("../../middlewares/isAdmin");

// Create an Item
router.post("/create", verifyToken, isAdmin,  upload.single("image"), createItem);

// Update Item
router.put("/:itemId", verifyToken, isAdmin,  upload.single("image"), updateItem);

// Delete Item
router.delete("/:itemId", verifyToken, isAdmin,  deleteItem);

// Get All Items
router.get("/", getAllItem);

// Filtered Items
router.get("/filtersitems", getItemsByFilters);

// GET /items?sortBy=latest OR popularity OR priceLowToHigh OR priceHighToLow OR offer
router.get("/sortitems", getSortedItems);

//search the item
router.get("/items/search", searchAndFilterItems);

// Get Items by Category ID
router.get("/category/:categoryId", getItemByCategoryId);

// Get Items by SubCategory ID
router.get("/subcategory/:subcategoryId", getItemBySubCategoryId);

// Get Single Item by ID (keep this at the end to avoid conflicts)
router.get("/:itemId", getItemById);


module.exports = router;
