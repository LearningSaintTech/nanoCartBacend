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
exports.createItem = async (req, res) => {
  try {
    const { name, MRP, totalStock, subCategoryId, categoryId, description, discountedPrice, filters} = req.body;

    console.log(req.body);
    console.log(req.file);

    // Validate required fields
    if (!name || !MRP || !totalStock || !subCategoryId || !categoryId || !req.file) {
      return res.status(400).json(apiResponse(400, false, "Name, MRP, totalStock, subCategoryId, categoryId, and image are required"));
    }

    // Validate numeric fields
    if (isNaN(Number(MRP)) || Number(MRP) < 0) {
      return res.status(400).json(apiResponse(400, false, "MRP must be a valid positive number"));
    }
    if (isNaN(Number(totalStock)) || Number(totalStock) < 0) {
      return res.status(400).json(apiResponse(400, false, "totalStock must be a valid positive number"));
    }
    if (discountedPrice && (isNaN(Number(discountedPrice)) || Number(discountedPrice) < 0)) {
      return res.status(400).json(apiResponse(400, false, "discountedPrice must be a valid positive number"));
    }

    // Validate Category and SubCategory existence
    const [categoryDetails, subCategoryDetails] = await Promise.all([
      Category.findById(categoryId),
      SubCategory.findById(subCategoryId),
    ]);

    if (!categoryDetails) {
      return res.status(400).json(apiResponse(400, false, "Category not found"));
    }
    if (!subCategoryDetails) {
      return res.status(400).json(apiResponse(400, false, "SubCategory not found"));
    }

    // Parse and validate filters
    let parsedFilters = [];
    if (filters) {
      parsedFilters = typeof filters === "string" ? JSON.parse(filters) : filters;
      if (!Array.isArray(parsedFilters)) {
        return res.status(400).json(apiResponse(400, false, "Filters must be an array"));
      }
      for (const filter of parsedFilters) {
        if (!filter.key || !filter.value || typeof filter.key !== "string" || typeof filter.value !== "string") {
          return res.status(400).json(apiResponse(400, false, "Each filter must have a non-empty key and value as strings"));
        }
      }
    }

    const itemId = new mongoose.Types.ObjectId();

    // Upload image
    const imageUrl = await uploadImageToS3(
      req.file,
      `Nanocart/categories/${categoryId}/subCategories/${subCategoryId}/item/${itemId}`
    );

    // Create item
    const item = new Item({
      _id: itemId,
      name,
      description: description || undefined,
      MRP: Number(MRP),
      totalStock: Number(totalStock),
      discountedPrice: discountedPrice ? Number(discountedPrice) : undefined,
      categoryId,
      subCategoryId,
      filters: parsedFilters,
      image: imageUrl,
    });

    await item.save();
    return res.status(201).json(apiResponse(201, true, "Item created successfully", item));
  } catch (error) {
    console.error("Error creating item:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};


exports.deleteItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid Item ID"));
    }

    // Find item
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json(apiResponse(404, false, "Item not found"));
    }

    // Delete item image from S3
    if (item.image) {
      await deleteFromS3(item.image);
    }

    // Delete related item details
    const itemDetails = await ItemDetail.find({ itemId });
    for (const itemDetail of itemDetails) {
      for (const colorObj of itemDetail.imagesByColor || []) {
        for (const image of colorObj.images || []) {
          await deleteFromS3(image.url);
        }
      }
    }
    await ItemDetail.deleteMany({ itemId });

    // Delete item
    await Item.findByIdAndDelete(itemId);

    return res.status(200).json(apiResponse(200, true, "Item and related item details deleted successfully"));
  } catch (error) {
    console.error("Error deleting item:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};



exports.updateItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { name, description, MRP, totalStock, discountedPrice, filters } = req.body;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid Item ID"));
    }

    // Validate numeric fields
    if (MRP && (isNaN(Number(MRP)) || Number(MRP) < 0)) {
      return res.status(400).json(apiResponse(400, false, "MRP must be a valid positive number"));
    }
    if (totalStock && (isNaN(Number(totalStock)) || Number(totalStock) < 0)) {
      return res.status(400).json(apiResponse(400, false, "totalStock must be a valid positive number"));
    }
    if (discountedPrice && (isNaN(Number(discountedPrice)) || Number(discountedPrice) < 0)) {
      return res.status(400).json(apiResponse(400, false, "discountedPrice must be a valid positive number"));
    }

    // Find item
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json(apiResponse(404, false, "Item not found"));
    }

    // Update image if provided
    if (req.file && item.image) {
      const newImageUrl = await updateFromS3(
        item.image,
        req.file,
        `Nanocart/categories/${item.categoryId}/subCategories/${item.subCategoryId}/item/${itemId}`
      );
      item.image = newImageUrl;
    }

    // Update fields
    if (name) item.name = name;
    if (description) item.description = description;
    if (MRP) item.MRP = Number(MRP);
    if (totalStock) item.totalStock = Number(totalStock);
    if (discountedPrice) item.discountedPrice = Number(discountedPrice);

    // Update filters if provided
    if (Array.isArray(filters) && filters.length > 0) {
      for (const filter of filters) {
        if (!filter.key || !filter.value || typeof filter.key !== "string" || typeof filter.value !== "string") {
          return res.status(400).json(apiResponse(400, false, "Each filter must have a non-empty key and value as strings"));
        }
      }
      item.filters = filters;
    }

    await item.save();

    return res.status(200).json(apiResponse(200, true, "Item updated successfully", item));
  } catch (error) {
    console.error("Error updating item:", error.message);
    return res.status(500).json(apiResponse(500, false, error.message));
  }
};


// Get All Items with Pagination
exports.getAllItem = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;       // default to page 1
    const limit = parseInt(req.query.limit) || 5;     // default to 10 items per page
    const skip = (page - 1) * limit;

    const totalItems = await Item.countDocuments();

    if (totalItems === 0) {
      return res.status(404).json(apiResponse(404, false, "No items found"));
    }

    const items = await Item.find().skip(skip).limit(limit);

    res.status(200).json(
      apiResponse(200, true, "Items fetched successfully", {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        items,
      })
    );
  } catch (error) {
    console.error("Error fetching items:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


// Get Item by ID 
exports.getItemById = async (req, res) => {
  try {
    const { itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid Item ID"));
    }

    const item = await Item.findById(itemId)
    if (!item) {
      return res.status(404).json(apiResponse(404, false, "Item not found"));
    }

    res
      .status(200)
      .json(apiResponse(200, true, "Item retrieved successfully", item));
  } catch (error) {
    console.error("Error fetching item:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};

// Get Items by Category ID
exports.getItemByCategoryId = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const page = parseInt(req.query.page) || 1;       
    const limit = parseInt(req.query.limit) || 5;    
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Invalid Category ID"));
    }

    const totalItems = await Item.countDocuments({ categoryId:categoryId });

    if (totalItems === 0) {
      return res
        .status(404)
        .json(apiResponse(404, false, "No items found for this category"));
    }

    const items = await Item.find({ categoryId:categoryId })
      .skip(skip)
      .limit(limit);

    res.status(200).json(
      apiResponse(200, true, "Items retrieved successfully", {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        items,
      })
    );
  } catch (error) {
    console.error("Error fetching items by category:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


// Get Items by SubCategory ID
exports.getItemBySubCategoryId = async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    const page = parseInt(req.query.page) || 1;        
    const limit = parseInt(req.query.limit) || 5;     
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(subcategoryId)) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Invalid SubCategory ID"));
    }

    const totalItems = await Item.countDocuments({ subCategoryId: subcategoryId });

    if (totalItems === 0) {
      return res
        .status(404)
        .json(apiResponse(404, false, "No items found for this subcategory"));
    }

    const items = await Item.find({ subCategoryId: subcategoryId })
      .skip(skip)
      .limit(limit);

    res.status(200).json(
      apiResponse(200, true, "Items retrieved successfully", {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        items,
      })
    );
  } catch (error) {
    console.error("Error fetching items by subcategory:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};


exports.getItemsByFilters = async (req, res) => {
  try {
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    // Clone and remove pagination keys from query
    const queryParams = { ...req.query };
    delete queryParams.page;
    delete queryParams.limit;

    // Build dynamic filter conditions
    const filterConditions = [];
    for (const [key, value] of Object.entries(queryParams)) {
      if (key && value) {
        filterConditions.push({
          filters: {
            $elemMatch: {
              key: key,
              value: value,
            },
          },
        });
      }
    }

    const query = filterConditions.length > 0 ? { $and: filterConditions } : {};

    // Count total items for pagination
    const totalItems = await Item.countDocuments(query);

    // Fetch paginated items
    const items = await Item.find(query)
      .skip(skip)
      .limit(limit);

    return res.status(200).json(
      apiResponse(200, true, "Items fetched successfully", {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        items,
      })
    );
  } catch (error) {
    console.error("Error in getItemsByFilters:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};
 