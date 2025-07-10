const Category = require("../../models/Category/Category");
const SubCategory = require("../../models/SubCategory/SubCategory");
const Item = require("../../models/Items/Item");
const ItemDetail = require("../../models/Items/ItemDetail");
const {
  uploadImageToS3,
  deleteFromS3,
  updateFromS3,
} = require("../../utils/s3Upload");
const mongoose = require("mongoose");
const { apiResponse } = require("../../utils/apiResponse");

exports.createSubCategory = async (req, res) => {
  try {
    const { name, description, isTrendy,categoryId } = req.body;

    if (!name || !categoryId) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Name and categoryId are required"));
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Category not found"));
    }

    if (!req.file) {
      return res.status(400).json(apiResponse(400, false, "Image is required"));
    }

    // Format name (First letter capital, rest lowercase)
    const formattedName =
      name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase();

    // Check for existing subcategory with the same name
    const existingSubCategory = await SubCategory.findOne({
      name: formattedName,
      categoryId:categoryId
    });
    if (existingSubCategory) {
      return res
        .status(409)
        .json(apiResponse(409, false, "Subcategory already created"));
    }

    const subCategoryId = new mongoose.Types.ObjectId();

    // Upload image to S3
    const imageUrl = await uploadImageToS3(
      req.file,
      `Naocart/categories/${categoryId}/subCategories/${subCategoryId}`
    );

    // Create subcategory
    const subCategory = new SubCategory({
      _id: subCategoryId,
      name: formattedName,
      description: description || undefined,
      image: imageUrl,
      isTrendy,
      categoryId: categoryId,
    });

    await subCategory.save();

    return res
      .status(201)
      .json(
        apiResponse(201, true, "SubCategory created successfully", subCategory)
      );
  } catch (error) {
    console.error("Create SubCategory Error:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

exports.deleteSubCategory = async (req, res) => {
  try {
    const { subcategoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(subcategoryId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid SubCategory ID"));
    }

    // Find subcategory
    const subCategory = await SubCategory.findById(subcategoryId);
    if (!subCategory) {
      return res.status(404).json(apiResponse(404, false, "SubCategory not found"));
    }

    // Delete subcategory image from S3
    if (subCategory.image) {
      await deleteFromS3(subCategory.image);
    }

    // Find and delete related items
    const items = await Item.find({ subCategoryId: subcategoryId });
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
    await Item.deleteMany({ subCategoryId: subcategoryId });

    // Delete subcategory
    await SubCategory.findByIdAndDelete(subcategoryId);

    return res.status(200).json(apiResponse(200, true, "SubCategory and related documents deleted successfully"));
  } catch (error) {
    console.error("Error deleting subcategory:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};

exports.updateSubCategory = async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    const { name, description,isTrendy } = req.body;

    if (!subcategoryId) {
      return res
        .status(400)
        .json(apiResponse(400, false, "SubCategory ID is required."));
    }

    // Find the subcategory
    const subCategory = await SubCategory.findById(subcategoryId);
    if (!subCategory) {
      return res
        .status(404)
        .json(apiResponse(404, false, "SubCategory not found."));
    }

    let oldImageUrl = subCategory.image;

    if (oldImageUrl && req.file) {
      const newImageUrl = await updateFromS3(
        oldImageUrl,
        req.file,
        `Naocart/categories/${subCategory.categoryId}/subCategories/${subcategoryId}`
      );
      subCategory.image = newImageUrl;
    }

    // Update name with proper format if provided
    if (name) {
      const formattedName =
        name.trim().charAt(0).toUpperCase() +
        name.trim().slice(1).toLowerCase();
      subCategory.name = formattedName;
    }

    // Update description if provided
    if (description) {
      subCategory.description = description;
    }

    // Update description if provided
    if (isTrendy) {
      subCategory.isTrendy = isTrendy;
    }

    await subCategory.save();

    return res
      .status(200)
      .json(
        apiResponse(200, true, "SubCategory updated successfully", subCategory)
      );
  } catch (error) {
    console.error("Error updating SubCategory:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


exports.getSubCategoryById = async (req, res) => {
  try {
    const { subcategoryId } = req.params;

    // Find category by ID
    const subCategory = await SubCategory.findById(subcategoryId);

    if (!subCategory) {
      return res
        .status(404)
        .json(apiResponse(404, false, "subCategory not found"));
    }

    res
      .status(200)
      .json(
        apiResponse(
          200,
          true,
          "SubCategory retrieved successfully",
          subCategory
        )
      );
  } catch (error) {
    console.error("Error fetching SubCategory:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


exports.getAllSubCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const subCategories = await SubCategory.find().skip(skip).limit(limit);
    const totalDocuments = await SubCategory.countDocuments();
    const totalPages = Math.ceil(totalDocuments / limit);

    if (subCategories.length === 0) {
      return res.status(404).json(apiResponse(404, false, "No subcategories found"));
    }

    return res.status(200).json(
      apiResponse(200, true, "Subcategories retrieved successfully", {
        subCategories,
        currentPage: page,
        totalPages,
        totalDocuments,
      })
    );
  } catch (error) {
    console.error("Error fetching subcategories:", error.message);
    res.status(500).json(apiResponse(500, false, "Server error while fetching subcategories"));
  }
};




exports.getSubCategoryByCategoryId = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid Category ID"));
    }

    const categoryObjectId = new mongoose.Types.ObjectId(categoryId);

    const subCategories = await SubCategory.find({ categoryId: categoryObjectId })
      .skip(skip)
      .limit(limit);

    const totalDocuments = await SubCategory.countDocuments({ categoryId: categoryObjectId });
    const totalPages = Math.ceil(totalDocuments / limit);

    if (subCategories.length === 0) {
      return res.status(404).json(
        apiResponse(404, false, "No SubCategory found for the given CategoryId")
      );
    }

    return res.status(200).json(
      apiResponse(200, true, "SubCategories retrieved successfully", {
        subCategories,
        currentPage: page,
        totalPages,
        totalDocuments,
      })
    );
  } catch (error) {
    console.error("Error fetching SubCategory:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};


// Controller to fetch all trendy subcategories
exports.getTrendySubCategories = async (req, res) => {
  try {
    const trendySubCategories = await SubCategory.find({ isTrendy: true })
      .populate('categoryId', 'name') 
      .lean(); 
    
    if (!trendySubCategories || trendySubCategories.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No trendy subcategories found',
      });
    }

    res.status(200).json(apiResponse(200,true,"successfully fetch subcategory",trendySubCategories));
  } catch (error) {
    console.error('Error fetching trendy subcategories:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching trendy subcategories',
      error: error.message,
    });
  }
};