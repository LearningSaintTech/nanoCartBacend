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
    const {
      name,
      MRP,
      totalStock,
      subCategoryId,
      categoryId,
      description,
      defaultColor,
      discountedPrice,
      filters
    } = req.body;

    // console.log(req.body);
    // console.log(req.file);

    // Validate required fields
    if (!name || !MRP || !totalStock || !subCategoryId || !categoryId || !defaultColor || !req.file) {
      return res.status(400).json(apiResponse(400, false, "Name, MRP, totalStock, subCategoryId, categoryId, color, and image are required"));
    }

    // Validate numeric fields
    if (isNaN(Number(MRP)) || Number(MRP) < 0) {
      return res.status(400).json(apiResponse(400, false, "MRP must be a valid positive number"));
    }
    if (isNaN(Number(totalStock)) || Number(totalStock) < 0) {
      return res.status(400).json(apiResponse(400, false, "totalStock must be a valid positive number"));
    }
    if (discountedPrice === undefined || discountedPrice === null) {
      return res.status(400).json(apiResponse(400, false, "discountedPrice is mandatory"));
    }
    if (isNaN(Number(discountedPrice)) || Number(discountedPrice) < 0) {
      return res.status(400).json(apiResponse(400, false, "discountedPrice must be a valid positive number"));
    }
    if (Number(discountedPrice) > Number(MRP)) {
      return res.status(400).json(apiResponse(400, false, "discountedPrice cannot be greater than MRP"));
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

      const capitalize = (str) => str.trim().charAt(0).toUpperCase() + str.trim().slice(1).toLowerCase();

      for (let i = 0; i < parsedFilters.length; i++) {
        const filter = parsedFilters[i];

        if (!filter.key || !filter.value || typeof filter.key !== "string" || typeof filter.value !== "string") {
          return res.status(400).json(apiResponse(400, false, "Each filter must have a non-empty key and value as strings"));
        }

        parsedFilters[i].key = capitalize(filter.key);
        parsedFilters[i].value = capitalize(filter.value);
      }
    }

    // Normalize and capitalize name and defaultColor
    const capitalize = (str) => str.trim().charAt(0).toUpperCase() + str.trim().slice(1).toLowerCase();
    const capitalName = capitalize(name);
    const capitalDefaultColor = capitalize(defaultColor);

    // Normalize name for comparison (lowercase, no spaces)
    const normalizeName = (str) => str.replace(/\s+/g, '').toLowerCase();
    const normalizedInputName = normalizeName(capitalName);

    // Fetch all items and check for duplicate name
    const items = await Item.find({}, 'name'); // Only fetch the name field
    const normalizedDbNames = items.map(item => normalizeName(item.name));
    
    if (normalizedDbNames.includes(normalizedInputName)) {
      return res.status(400).json(apiResponse(400, false, "Item with this name already exists"));
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
      name: capitalName,
      description: description || undefined,
      MRP: Number(MRP),
      totalStock: Number(totalStock),
      discountedPrice: Number(discountedPrice),
      categoryId,
      subCategoryId,
      filters: parsedFilters,
      image: imageUrl,
      defaultColor: capitalDefaultColor
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
    const { name, description, MRP, totalStock, discountedPrice, defaultColor } = req.body;
    let { filters } = req.body;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid Item ID"));
    }

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json(apiResponse(404, false, "Item not found"));
    }

    const newMRP = MRP !== undefined ? Number(MRP) : item.MRP;
    const newDiscountedPrice = discountedPrice !== undefined ? Number(discountedPrice) : item.discountedPrice;

    // Validate numeric fields
    if (MRP !== undefined && (isNaN(newMRP) || newMRP < 0)) {
      return res.status(400).json(apiResponse(400, false, "MRP must be a valid positive number"));
    }
    if (totalStock !== undefined && (isNaN(Number(totalStock)) || Number(totalStock) < 0)) {
      return res.status(400).json(apiResponse(400, false, "totalStock must be a valid positive number"));
    }
    if (discountedPrice !== undefined && (isNaN(newDiscountedPrice) || newDiscountedPrice < 0)) {
      return res.status(400).json(apiResponse(400, false, "discountedPrice must be a valid positive number"));
    }

    // Custom validation block
    if (MRP !== undefined && discountedPrice === undefined) {
      return res.status(400).json(apiResponse(400, false, "discountedPrice is mandatory when MRP is provided"));
    }
    if (MRP !== undefined && discountedPrice !== undefined && newDiscountedPrice > newMRP) {
      return res.status(400).json(apiResponse(400, false, "discountedPrice cannot be greater than MRP"));
    }
    if (MRP === undefined && discountedPrice !== undefined && newDiscountedPrice > item.MRP) {
      return res.status(400).json(apiResponse(400, false, "discountedPrice cannot be greater than existing MRP"));
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

    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    if (name) item.name = capitalize(name.trim());
    if (description) item.description = description;
    if (MRP !== undefined) item.MRP = newMRP;
    if (totalStock !== undefined) item.totalStock = Number(totalStock);
    if (discountedPrice !== undefined) item.discountedPrice = newDiscountedPrice;
    if (defaultColor) item.defaultColor =  capitalize(defaultColor.trim());

    // Parse filters if needed
    if (typeof filters === 'string') {
      try {
        filters = JSON.parse(filters);
      } catch {
        return res.status(400).json(apiResponse(400, false, "Invalid JSON format for filters"));
      }
    }

    if (Array.isArray(filters) && filters.length > 0) {
      for (let i = 0; i < filters.length; i++) {
        const filter = filters[i];
        if (!filter.key || !filter.value || typeof filter.key !== "string" || typeof filter.value !== "string") {
          return res.status(400).json(apiResponse(400, false, "Each filter must have a non-empty key and value as strings"));
        }

        filters[i].key = capitalize(filter.key.trim());
        filters[i].value = capitalize(filter.value.trim());
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
 
exports.getSortedItems = async (req, res) => {
  try {
    const { sortBy, page = 1, limit = 10 } = req.query;

    // Validate sortBy
    const validSortOptions = ['latest', 'popularity', 'priceLowToHigh', 'priceHighToLow', 'offer'];
    if (sortBy && !validSortOptions.includes(sortBy)) {
      return res.status(400).json(apiResponse(400, false, 'Invalid sortBy parameter', null));
    }

    // Define sort options
    let sortOptions = {};
    switch (sortBy) {
      case 'latest':
        sortOptions = { createdAt: -1 };
        break;
      case 'popularity':
        sortOptions = { userAverageRating: -1 };
        break;
      case 'priceLowToHigh':
        sortOptions = { MRP: 1 };
        break;
      case 'priceHighToLow':
        sortOptions = { MRP: -1 };
        break;
      case 'offer':
        sortOptions = { discountPercentage: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    // Fetch items with pagination and lean
    const items = await Item.find()
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('name MRP discountedPrice discountPercentage image userAverageRating')
      .lean();

    return res.status(200).json(
      apiResponse(200, true, 'Items fetched successfully', {
        count: items.length,
        page: Number(page),
        limit: Number(limit),
        items,
      })
    );
  } catch (error) {
    console.error('Error in getSortedItems:', error.message);
    const message = error.name === 'MongoNetworkError'
      ? 'Database connection error'
      : 'Server error while fetching sorted items';
    return res.status(500).json(apiResponse(500, false, message, null));
  }
};


// // Utility to build regex for fuzzy search
// const buildFuzzyRegex = (input) => {
//   const sanitized = input.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // Escape special chars
//   return new RegExp(sanitized.split("").join(".*"), "i");
// };
// exports.searchItems = async (req, res) => {
//   try {
//     const {
//       keyword,
//       category,
//       subCategory,
//       minPrice,
//       maxPrice,
//       color,
//       size,
//       fabric,
//       occasion,
//       pattern,
//       type,
//       border,
//       rating,
//       page = 1,
//       limit = 10,
//     } = req.query;

//     const query = {};

//     // Input validation
//     if (minPrice && isNaN(minPrice)) {
//       return res.status(400).json(apiResponse(400, false, "Invalid minPrice parameter", null));
//     }
//     if (maxPrice && isNaN(maxPrice)) {
//       return res.status(400).json(apiResponse(400, false, "Invalid maxPrice parameter", null));
//     }
//     if (rating && (isNaN(rating) || rating < 0 || rating > 5)) {
//       return res.status(400).json(apiResponse(400, false, "Invalid rating parameter (must be between 0 and 5)", null));
//     }

//     // Keyword Search
//     if (keyword && keyword.trim()) {
//       const regex = buildFuzzyRegex(keyword.trim());
//       query.$or = [
//         { name: { $regex: regex } },
//         { description: { $regex: regex } }, // Re-enabled description search
//         { "filters.value": { $regex: regex } },
//       ];
//     }

//     // Category/Subcategory
//     if (category && mongoose.Types.ObjectId.isValid(category)) {
//       query.categoryId = category;
//     }
//     if (subCategory && mongoose.Types.ObjectId.isValid(subCategory)) {
//       query.subCategoryId = subCategory;
//     }

//     // Price Range
//     if (minPrice || maxPrice) {
//       query.discountedPrice = {};
//       if (minPrice) query.discountedPrice.$gte = Number(minPrice);
//       if (maxPrice) query.discountedPrice.$lte = Number(maxPrice);
//     }

//     // Filters
//     const filterConditions = [];
//     if (color) filterConditions.push({ $elemMatch: { key: "Color", value: new RegExp(color, "i") } });
//     if (size) filterConditions.push({ $elemMatch: { key: "Size", value: new RegExp(size, "i") } });
//     if (fabric) filterConditions.push({ $elemMatch: { key: "Fabric", value: new RegExp(fabric, "i") } });
//     if (occasion) filterConditions.push({ $elemMatch: { key: "Occasion", value: new RegExp(occasion, "i") } });
//     if (pattern) filterConditions.push({ $elemMatch: { key: "Pattern", value: new RegExp(pattern, "i") } });
//     if (type) filterConditions.push({ $elemMatch: { key: "Type", value: new RegExp(type, "i") } });
//     if (border) filterConditions.push({ $elemMatch: { key: "Border", value: new RegExp(border, "i") } });

//     if (filterConditions.length > 0) {
//       query.filters = { $and: filterConditions };
//     }

//     // Rating
//     if (rating) {
//       query.userAverageRating = { $gte: Number(rating) };
//     }

//     // Execute query with pagination
//     const items = await Item.find(query)
//       .skip((page - 1) * limit)
//       .limit(Number(limit))
//       .select("name MRP discountedPrice discountPercentage image userAverageRating filters")
//       .lean();

//     return res.status(200).json(
//       apiResponse(200, true, "Items fetched successfully", {
//         count: items.length,
//         page: Number(page),
//         limit: Number(limit),
//         items,
//       })
//     );
//   } catch (error) {
//     console.error("Search error:", error.message);
//     const message = error.name === "MongoNetworkError"
//       ? "Database connection error"
//       : "Server error during item search";
//     return res.status(500).json(apiResponse(500, false, message, null));
//   }
// };



// Utility to build regex for stricter keyword search
const buildSearchRegex = (input) => {
  const sanitized = input.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // Escape special chars
  return new RegExp(`\\b${sanitized}\\b`, "i"); // Match whole word, case-insensitive
};

exports.searchItems = async (req, res) => {
  try {
    const {
      keyword,
      category,
      subCategory,
      minPrice,
      maxPrice,
      color,
      size,
      fabric,
      occasion,
      pattern,
      type,
      border,
      rating,
      page = 1,
      limit = 10,
    } = req.query;

    const query = {};

    // Input validation
    if (minPrice && isNaN(minPrice)) {
      return res.status(400).json(apiResponse(400, false, "Invalid minPrice parameter", null));
    }
    if (maxPrice && isNaN(maxPrice)) {
      return res.status(400).json(apiResponse(400, false, "Invalid maxPrice parameter", null));
    }
    if (rating && (isNaN(rating) || rating < 0 || rating > 5)) {
      return res.status(400).json(apiResponse(400, false, "Invalid rating parameter (must be between 0 and 5)", null));
    }

    // Keyword Search
    if (keyword && keyword.trim()) {
      const regex = buildSearchRegex(keyword.trim());
      query.$or = [
        { name: { $regex: regex } },
        { description: { $regex: regex } },
        { "filters.value": { $regex: regex } },
      ];
    }

    // Category/Subcategory
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      query.categoryId = category;
    }
    if (subCategory && mongoose.Types.ObjectId.isValid(subCategory)) {
      query.subCategoryId = subCategory;
    }

    // Price Range
    if (minPrice || maxPrice) {
      query.discountedPrice = {};
      if (minPrice) query.discountedPrice.$gte = Number(minPrice);
      if (maxPrice) query.discountedPrice.$lte = Number(maxPrice);
    }

    // Filters
    const filterConditions = [];
    if (color) filterConditions.push({ $elemMatch: { key: "Color", value: new RegExp(`\\b${color}\\b`, "i") } });
    if (size) filterConditions.push({ $elemMatch: { key: "Size", value: new RegExp(`\\b${size}\\b`, "i") } });
    if (fabric) filterConditions.push({ $elemMatch: { key: "Fabric", value: new RegExp(`\\b${fabric}\\b`, "i") } });
    if (occasion) filterConditions.push({ $elemMatch: { key: "Occasion", value: new RegExp(`\\b${occasion}\\b`, "i") } });
    if (pattern) filterConditions.push({ $elemMatch: { key: "Pattern", value: new RegExp(`\\b${pattern}\\b`, "i") } });
    if (type) filterConditions.push({ $elemMatch: { key: "Type", value: new RegExp(`\\b${type}\\b`, "i") } });
    if (border) filterConditions.push({ $elemMatch: { key: "Border", value: new RegExp(`\\b${border}\\b`, "i") } });

    if (filterConditions.length > 0) {
      query.filters = { $and: filterConditions };
    }

    // Rating
    if (rating) {
      query.userAverageRating = { $gte: Number(rating) };
    }

    // Execute query with pagination
    const items = await Item.find(query)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select("name MRP discountedPrice discountPercentage image userAverageRating filters")
      .lean();

    return res.status(200).json(
      apiResponse(200, true, "Items fetched successfully", {
        count: items.length,
        page: Number(page),
        limit: Number(limit),
        items,
      })
    );
  } catch (error) {
    console.error("Search error:", error.message);
    const message = error.name === "MongoNetworkError"
      ? "Database connection error"
      : "Server error during item search";
    return res.status(500).json(apiResponse(500, false, message, null));
  }
};