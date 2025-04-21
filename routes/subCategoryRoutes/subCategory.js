 const express = require("express");
 const multer = require("multer");
 const { createSubCategory,updateSubCategory,deleteSubCategory,getAllSubCategories,getSubCategoryById,getSubCategoryByCategoryId } = require("../../controllers/subCategoryController/subCategory");
 
 const router = express.Router();
 
 // Configure Multer for handling file uploads
 const storage = multer.memoryStorage();   
 const upload = multer({ storage });
 
 const {verifyToken}=require("../../middlewares/verifyToken");
 const {isAdmin}=require("../../middlewares/isAdmin");

 // Define the route for creating a Subcategory
 router.post("/create", verifyToken, isAdmin,  upload.single("image"), createSubCategory);
  
 // Define the route for updating a Subcategory
 router.put("/:subcategoryId", verifyToken, isAdmin,   upload.single("image"), updateSubCategory);
 
 // Define the route for Delete a Subcategory
 router.delete("/:subcategoryId", verifyToken, isAdmin,   deleteSubCategory);
 
 // Define the route for get All  Subcategory
 router.get("/", getAllSubCategories);
 
 // Define the route for get a subCategory By Id
 router.get("/:subcategoryId", getSubCategoryById);

 // Define the route for get a subCategory based on category
 router.get("/categories/:categoryId", getSubCategoryByCategoryId);
 

 module.exports = router;
 