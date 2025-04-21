const express = require("express");
const multer = require("multer");
const {
  createCategory,
  updateCategory,
  deleteCategory,
  getAllCategories,
  getCategoryById,
} = require("../../controllers/categoryController/category");

const router = express.Router();

// Configure Multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

const { verifyToken } = require("../../middlewares/verifyToken");
const { isAdmin } = require("../../middlewares/isAdmin");

// Define the route for creating a category
router.post(
  "/create",
  verifyToken,
  isAdmin,
  upload.single("image"),
  createCategory
);

// Define the route for updating a category
router.put(
  "/:categoryId",
  verifyToken,
  isAdmin,
  upload.single("image"),
  updateCategory
);

// Define the route for Delete a category
router.delete("/:categoryId", verifyToken, isAdmin, deleteCategory);

// Define the route for get All  category
router.get("/", getAllCategories);

// Define the route for get a category
router.get("/:categoryId", getCategoryById);

module.exports = router;
