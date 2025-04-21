const Category = require("../../models/Category/Category");
const SubCategory = require("../../models/SubCategory/SubCategory");
const Item = require("../../models/Items/Item");
const ItemDetail = require("../../models/Items/ItemDetail");
const mongoose = require("mongoose");
const { apiResponse } = require("../../utils/apiResponse");
const {
  uploadImageToS3,
  deleteFromS3,
  updateFromS3,
} = require("../../utils/s3Upload"); 



exports.createCategory = async (req, res) => {
  try {
    let { name, description } = req.body;

    if (!name) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Name required"));
    }
   

    // Normalize the category name: First letter capital, rest lowercase
    name = name.trim();
    const formattedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

    // Check if category with same name already exists
    const existingCategory = await Category.findOne({ name: formattedName });
    if (existingCategory) {
      return res
        .status(409)
        .json(apiResponse(409, false, "This category already exists"));
    }

    const categoryId = new mongoose.Types.ObjectId();

    let imageUrl;
    if(req.file){
      imageUrl = await uploadImageToS3(req.file, `NanoCart/categories/${categoryId}`);
    }
    
    // Create new category
    const category = new Category({
      _id:categoryId,
      name: formattedName,
      description:description ||undefined,
      image: imageUrl ||undefined,
    });

    await category.save();

    return res
      .status(201)
      .json(apiResponse(201, true, "Category created successfully", { category }));
  } catch (error) {
    
    console.error("Error creating category:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid Category ID"));
    }

    // Find category
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json(apiResponse(404, false, "Category not found"));
    }

    // Delete category image from S3
    if (category.image) {
      await deleteFromS3(category.image);
    }

    // Find and delete related subcategories
    const subCategories = await SubCategory.find({ categoryId });
    for (const subCategory of subCategories) {
      if (subCategory.image) {
        await deleteFromS3(subCategory.image);
      }
    }
    await SubCategory.deleteMany({ categoryId });

    // Find and delete related items
    const items = await Item.find({ categoryId });
    for (const item of items) {
      if (item.image) {
        await deleteFromS3(item.image);
      }
      // Delete related item details
      const itemDetails = await ItemDetail.find({ itemId: item._id });
      for (const itemDetail of itemDetails) {
        for (const colorObj of itemDetail.imagesByColor || []) {
          for (const image of colorObj.images || []) {
            await deleteFromS3(image.url);
          }
        }
      }
      await ItemDetail.deleteMany({ itemId: item._id });
    }
    await Item.deleteMany({ categoryId });

    // Delete category
    await Category.findByIdAndDelete(categoryId);

    return res.status(200).json(apiResponse(200, true, "Category and related documents deleted successfully"));
  } catch (error) {
    console.error("Error deleting category:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description } = req.body;

    if (!categoryId) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Category ID is required."));
    }

    // Find the category
    const category = await Category.findById(categoryId);
    if (!category) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Category not found."));
    }

    // Format new name if provided
    let formattedName;
    if (name) {
      const trimmed = name.trim();
      formattedName = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    }

    // Image update (if a new file is provided)
    let newImageUrl;
    if (req.file) {
      newImageUrl = await updateFromS3(category.image, req.file, `Nanocart/categories/${categoryId}`);
    }

    // Apply updates
    category.name = formattedName || category.name;
    category.description = description || category.description;
    category.image = newImageUrl || category.image;

    await category.save();

    res
      .status(200)
      .json(apiResponse(200, true, "Category updated successfully.", { category }));
  } catch (error) {
    console.error("Error updating category:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res
      .status(200)
      .json(
        apiResponse(200, true, "Categories retrieved successfully", categories)
      );
  } catch (error) {
    console.error("Error fetching categories:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


exports.getCategoryById = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Find category by ID
    const category = await Category.findById(categoryId);

    if (!category) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Category not found"));
    }

    return res
      .status(200)
      .json(apiResponse(200, true, "Category retrieved successfully",{category}));
  } catch (error) {
    console.error("Error fetching category:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};
