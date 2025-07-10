const mongoose = require("mongoose");
const Category = require("../../models/Category/Category");
const SubCategory = require("../../models/SubCategory/SubCategory");
const Item = require("../../models/Items/Item");
const ItemDetail = require("../../models/Items/Item");
const {
  uploadImageToS3,
  uploadMultipleImagesToS3,
  deleteFromS3,
  updateFromS3,
} = require("../../utils/s3Upload");
const { apiResponse } = require("../../utils/apiResponse");

// Utility to normalize names for comparison
const normalizeName = (str) => str.replace(/\s+/g, "").toLowerCase();

// Utility to capitalize strings
const capitalize = (str) => str.trim().charAt(0).toUpperCase() + str.trim().slice(1).toLowerCase();

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
      filters,
    } = req.body;

    // Validate required fields
    if (!name || !MRP || !totalStock || !subCategoryId || !categoryId || !defaultColor) {
      return res.status(400).json(
        apiResponse(400, false, "Name, MRP, totalStock, subCategoryId, categoryId, and defaultColor are required")
      );
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

    // Validate Category and SubCategory existence and relationship
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
    if (subCategoryDetails.categoryId.toString() !== categoryId) {
      return res.status(400).json(
        apiResponse(400, false, `SubCategory ${subCategoryId} does not belong to Category ${categoryId}`)
      );
    }

    // Parse and validate filters
    let parsedFilters = [];
    if (filters) {
      parsedFilters = typeof filters === "string" ? JSON.parse(filters) : filters;
      if (!Array.isArray(parsedFilters)) {
        return res.status(400).json(apiResponse(400, false, "Filters must be an array"));
      }
      for (let i = 0; i < parsedFilters.length; i++) {
        const filter = parsedFilters[i];
        if (!filter.key || !filter.value || typeof filter.key !== "string" || typeof filter.value !== "string") {
          return res.status(400).json(
            apiResponse(400, false, "Each filter must have a non-empty key and value as strings")
          );
        }
        parsedFilters[i].key = capitalize(filter.key);
        parsedFilters[i].value = capitalize(filter.value);
      }
    }

    // Normalize and capitalize name and defaultColor
    const capitalName = capitalize(name);
    const capitalDefaultColor = capitalize(defaultColor);

    // Check for duplicate name
    const normalizedInputName = normalizeName(capitalName);
    const existingItem = await Item.findOne({ name: new RegExp(`^${normalizedInputName}$`, "i") });
    if (existingItem) {
      return res.status(400).json(apiResponse(400, false, "Item with this name already exists"));
    }

    const itemId = new mongoose.Types.ObjectId();

    // Upload image if provided (optional)
    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadImageToS3(
        req.file,
        `Nanocart/categories/${categoryId}/subCategories/${subCategoryId}/item/${itemId}`
      );
    }

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
      defaultColor: capitalDefaultColor,
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
    const { name, description, MRP, totalStock, discountedPrice, defaultColor, itemImageId, categoryId, subCategoryId } = req.body;
    let { filters } = req.body;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid Item ID"));
    }

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json(apiResponse(404, false, "Item not found"));
    }

    // Validate Category and SubCategory if provided
    if (categoryId || subCategoryId) {
      const [categoryDetails, subCategoryDetails] = await Promise.all([
        categoryId ? Category.findById(categoryId) : Promise.resolve(null),
        subCategoryId ? SubCategory.findById(subCategoryId) : Promise.resolve(null),
      ]);

      if (categoryId && !categoryDetails) {
        return res.status(400).json(apiResponse(400, false, "Category not found"));
      }
      if (subCategoryId && !subCategoryDetails) {
        return res.status(400).json(apiResponse(400, false, "SubCategory not found"));
      }
      if (categoryId && subCategoryId && subCategoryDetails.categoryId.toString() !== categoryId) {
        return res.status(400).json(
          apiResponse(400, false, `SubCategory ${subCategoryId} does not belong to Category ${categoryId}`)
        );
      }
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
    let newCategoryId = categoryId || item.categoryId;
    let newSubCategoryId = subCategoryId || item.subCategoryId;
    if (req.file && item.image) {
      const newImageUrl = await updateFromS3(
        item.image,
        req.file,
        `Nanocart/categories/${newCategoryId}/subCategories/${newSubCategoryId}/item/${itemId}`
      );
      item.image = newImageUrl;
    } else if (req.file) {
      const newImageUrl = await uploadImageToS3(
        req.file,
        `Nanocart/categories/${newCategoryId}/subCategories/${newSubCategoryId}/item/${itemId}`
      );
      item.image = newImageUrl;
    }

    if (name) {
      const normalizedInputName = normalizeName(capitalize(name));
      const existingItem = await Item.findOne({
        name: new RegExp(`^${normalizedInputName}$`, "i"),
        _id: { $ne: itemId },
      });
      if (existingItem) {
        return res.status(400).json(apiResponse(400, false, "Item with this name already exists"));
      }
      item.name = capitalize(name);
    }
    if (description) item.description = description;
    if (MRP !== undefined) item.MRP = newMRP;
    if (totalStock !== undefined) item.totalStock = Number(totalStock);
    if (discountedPrice !== undefined) item.discountedPrice = newDiscountedPrice;
    if (defaultColor) item.defaultColor = capitalize(defaultColor);
    if (itemImageId) item.itemImageId = itemImageId;
    if (categoryId) item.categoryId = categoryId;
    if (subCategoryId) item.subCategoryId = subCategoryId;

    // Parse filters if provided
    if (typeof filters === "string") {
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
          return res.status(400).json(
            apiResponse(400, false, "Each filter must have a non-empty key and value as strings")
          );
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

exports.getAllItem = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
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

exports.getItemById = async (req, res) => {
  try {
    const { itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid Item ID"));
    }

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json(apiResponse(404, false, "Item not found"));
    }

    res.status(200).json(apiResponse(200, true, "Item retrieved successfully", item));
  } catch (error) {
    console.error("Error fetching item:", error.message);
    res.status(500).json(apiResponse(500, false, error.message));
  }
};

exports.getItemByCategoryId = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid Category ID"));
    }

    const totalItems = await Item.countDocuments({ categoryId });

    if (totalItems === 0) {
      return res.status(404).json(apiResponse(404, false, "No items found for this category"));
    }

    const items = await Item.find({ categoryId }).skip(skip).limit(limit);

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

exports.getItemBySubCategoryId = async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(subcategoryId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid SubCategory ID"));
    }

    const totalItems = await Item.countDocuments({ subCategoryId: subcategoryId });

    if (totalItems === 0) {
      return res.status(404).json(apiResponse(404, false, "No items found for this subcategory"));
    }

    const items = await Item.find({ subCategoryId: subcategoryId }).skip(skip).limit(limit);

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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const queryParams = { ...req.query };
    delete queryParams.page;
    delete queryParams.limit;

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

    const totalItems = await Item.countDocuments(query);
    const items = await Item.find(query).skip(skip).limit(limit);

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

    const validSortOptions = ["latest", "popularity", "priceLowToHigh", "priceHighToLow", "offer"];
    if (sortBy && !validSortOptions.includes(sortBy)) {
      return res.status(400).json(apiResponse(400, false, "Invalid sortBy parameter"));
    }

    let sortOptions = {};
    switch (sortBy) {
      case "latest":
        sortOptions = { createdAt: -1 };
        break;
      case "popularity":
        sortOptions = { userAverageRating: -1 };
        break;
      case "priceLowToHigh":
        sortOptions = { MRP: 1 };
        break;
      case "priceHighToLow":
        sortOptions = { MRP: -1 };
        break;
      case "offer":
        sortOptions = { discountPercentage: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    const items = await Item.find()
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select("name MRP discountedPrice discountPercentage image userAverageRating")
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
    console.error("Error in getSortedItems:", error.message);
    const message = error.name === "MongoNetworkError" ? "Database connection error" : "Server error while fetching sorted items";
    return res.status(500).json(apiResponse(500, false, message));
  }
};

const buildSearchRegex = (input) => {
  const sanitized = input.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${sanitized}\\b`, "i");
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

    if (minPrice && isNaN(minPrice)) {
      return res.status(400).json(apiResponse(400, false, "Invalid minPrice parameter"));
    }
    if (maxPrice && isNaN(maxPrice)) {
      return res.status(400).json(apiResponse(400, false, "Invalid maxPrice parameter"));
    }
    if (rating && (isNaN(rating) || rating < 0 || rating > 5)) {
      return res.status(400).json(apiResponse(400, false, "Invalid rating parameter (must be between 0 and 5)"));
    }

    if (keyword && keyword.trim()) {
      const regex = buildSearchRegex(keyword.trim());
      query.$or = [
        { name: { $regex: regex } },
        { description: { $regex: regex } },
        { "filters.value": { $regex: regex } },
      ];
    }

    if (category && mongoose.Types.ObjectId.isValid(category)) {
      query.categoryId = category;
    }
    if (subCategory && mongoose.Types.ObjectId.isValid(subCategory)) {
      query.subCategoryId = subCategory;
    }

    if (minPrice || maxPrice) {
      query.discountedPrice = {};
      if (minPrice) query.discountedPrice.$gte = Number(minPrice);
      if (maxPrice) query.discountedPrice.$lte = Number(maxPrice);
    }

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

    if (rating) {
      query.userAverageRating = { $gte: Number(rating) };
    }

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
    const message = error.name === "MongoNetworkError" ? "Database connection error" : "Server error during item search";
    return res.status(500).json(apiResponse(500, false, message));
  }
};

exports.bulkUploadItemsFromFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(apiResponse(400, false, "No file uploaded."));
    }

    // Parse JSON from uploaded file buffer
    const fileContent = req.file.buffer.toString("utf-8");
    let items;

    try {
      items = JSON.parse(fileContent);
    } catch (err) {
      return res.status(400).json(apiResponse(400, false, "Invalid JSON format."));
    }

    if (!Array.isArray(items)) {
      return res.status(400).json(apiResponse(400, false, "JSON should be an array of items."));
    }

    // Validate required fields and IDs
    const categoryIds = [...new Set(items.map((item) => item.categoryId))];
    const subCategoryIds = [...new Set(items.map((item) => item.subCategoryId))];

    // Check if all categoryIds exist
    const categories = await Category.find({ _id: { $in: categoryIds } });
    const validCategoryIds = new Set(categories.map((cat) => cat._id.toString()));
    for (const item of items) {
      if (!validCategoryIds.has(item.categoryId)) {
        return res.status(400).json(apiResponse(400, false, `Invalid categoryId: ${item.categoryId}`));
      }
    }

    // Check if all subCategoryIds exist and belong to the specified categoryId
    const subCategories = await SubCategory.find({ _id: { $in: subCategoryIds } });
    const validSubCategoryIds = new Set(subCategories.map((subCat) => subCat._id.toString()));
    for (const item of items) {
      if (!validSubCategoryIds.has(item.subCategoryId)) {
        return res.status(400).json(apiResponse(400, false, `Invalid subCategoryId: ${item.subCategoryId}`));
      }
      const subCategory = subCategories.find((subCat) => subCat._id.toString() === item.subCategoryId);
      if (!subCategory || subCategory.categoryId.toString() !== item.categoryId) {
        return res.status(400).json(
          apiResponse(400, false, `subCategoryId ${item.subCategoryId} does not belong to categoryId ${item.categoryId}`)
        );
      }
    }

    // Validate required fields for each item
    for (const item of items) {
      console.log(item);
      if (!item.name || !item.MRP || !item.totalStock || !item.categoryId || !item.subCategoryId || !item.itemImageId) {
        return res.status(400).json(
          apiResponse(400, false, "Each item must have name, MRP, totalStock, categoryId, subCategoryId, and itemImageId.")
        );
      }
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(item.categoryId) || !mongoose.Types.ObjectId.isValid(item.subCategoryId)) {
        return res.status(400).json(
          apiResponse(400, false, `Invalid ObjectId format for categoryId or subCategoryId in item: ${item.name}`)
        );
      }
      // Validate numeric fields
      if (isNaN(Number(item.MRP)) || Number(item.MRP) < 0) {
        return res.status(400).json(apiResponse(400, false, `Invalid MRP for item: ${item.name}`));
      }
      if (isNaN(Number(item.totalStock)) || Number(item.totalStock) < 0) {
        return res.status(400).json(apiResponse(400, false, `Invalid totalStock for item: ${item.name}`));
      }
      if (item.discountedPrice && (isNaN(Number(item.discountedPrice)) || Number(item.discountedPrice) < 0)) {
        return res.status(400).json(apiResponse(400, false, `Invalid discountedPrice for item: ${item.name}`));
      }
      if (item.discountedPrice && Number(item.discountedPrice) > Number(item.MRP)) {
        return res.status(400).json(
          apiResponse(400, false, `discountedPrice cannot be greater than MRP for item: ${item.name}`)
        );
      }
    }

    // Insert all items into DB
    const insertedItems = await Item.insertMany(items, { ordered: false });

    return res.status(201).json(
      apiResponse(201, true, `${insertedItems.length} items uploaded successfully.`, { items: insertedItems })
    );
  } catch (error) {
    console.error("Bulk Upload Error:", error);
    if (error.name === "MongoBulkWriteError" && error.code === 11000) {
      return res.status(400).json(apiResponse(400, false, "Duplicate item detected. Check name or itemImageId."));
    }
    return res.status(500).json(apiResponse(500, false, "Internal Server Error."));
  }
};

exports.bulkUploadItemImages = async (req, res) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json(apiResponse(400, false, "No image files uploaded."));
    }

    // Validate file mimetypes
    const validMimetypes = ["image/jpeg", "image/png", "image/webp"];
    for (const file of req.files) {
      if (!validMimetypes.includes(file.mimetype)) {
        return res.status(400).json(
          apiResponse(400, false, `Invalid file type for ${file.originalname}. Only JPEG, PNG, or WebP allowed.`)
        );
      }
    }

    // Extract itemImageId from each file's originalname (without extension)
    const imageData = req.files.map((file) => {
      const itemImageId = file.originalname.split(".")[0];
      return { file, itemImageId };
    });

    // Find items in the database matching the itemImageIds
    const itemImageIds = imageData.map((data) => data.itemImageId);
    const items = await Item.find({ itemImageId: { $in: itemImageIds } });

    // Map files to their corresponding items and construct folderName
    const filesToUpload = imageData
      .filter((data) => items.some((item) => item.itemImageId === data.itemImageId))
      .map((data) => {
        const item = items.find((item) => item.itemImageId === data.itemImageId);
        return {
          file: data.file,
          folderName: `Nanocart/categories/${item.categoryId}/subCategories/${item.subCategoryId}/item/${item._id}`,
        };
      });

    // Check if any files were matched
    if (filesToUpload.length === 0) {
      return res.status(400).json(apiResponse(400, false, "No uploaded files match any items in the database."));
    }

    // Upload images to S3
    const uploadPromises = filesToUpload.map(({ file, folderName }) =>
      uploadMultipleImagesToS3([file], folderName)
    );
    const uploadResults = await Promise.all(uploadPromises);
    const imageUrls = uploadResults.flat();

    // Update items with S3 URLs
    const updatePromises = imageData.map(async (data, index) => {
      const item = items.find((item) => item.itemImageId === data.itemImageId);
      if (item) {
        item.image = imageUrls[index];
        await item.save();
        return { itemImageId: data.itemImageId, imageUrl: imageUrls[index] };
      }
    });

    const updatedItems = await Promise.all(updatePromises);

    return res.status(200).json(
      apiResponse(200, true, `${updatedItems.filter((item) => item).length} images uploaded and items updated successfully.`, {
        items: updatedItems.filter((item) => item),
      })
    );
  } catch (error) {
    console.error("Bulk Image Upload Error:", error);
    return res.status(500).json(apiResponse(500, false, "Internal Server Error."));
  }
};

exports.findItems=async(req, res)=> {
  try {
    const {
      categoryId,
      subCategoryId,
      filters,
      name,
      keyword,
      sortBy = 'latestAddition' // Default sorting
    } = req.body;

    // Build the query object
    let query = {};

    // Add categoryId to query if provided
    if (categoryId) {
      query.categoryId = categoryId;
    }

    // Add subCategoryId to query if provided
    if (subCategoryId) {
      query.subCategoryId = subCategoryId;
    }

    // Add filters to query if provided
    if (filters && Array.isArray(filters)) {
      query.filters = {
        $all: filters.map(filter => ({
          $elemMatch: { key: filter.key, value: filter.value }
        }))
      };
    }

    // Add name to query if provided (case-insensitive partial match)
    if (name) {
      query.name = { $regex: name, $options: 'i' };
    }

    // Add keyword search for name and description if provided
    if (keyword) {
      query.$text = { $search: keyword };
    }

    // Define sorting options
    const sortOptions = {
      latestAddition: { createdAt: -1 }, // Newest first
      popularity: { userAverageRating: -1 }, // Highest rated first
      priceHighToLow: { discountedPrice: -1 }, // Highest price first
      priceLowToHigh: { discountedPrice: 1 } // Lowest price first
    };

    // Validate sortBy parameter
    const validSortBy = sortOptions[sortBy] ? sortBy : 'latestAddition';
    console.log(validSortBy);

    // Execute the query
    const items = await Item.find(query)
      .populate('categoryId', 'name') // Populate category name
      .populate('subCategoryId', 'name') // Populate subcategory name
      .sort(sortOptions[validSortBy])
      .lean(); // Convert to plain JavaScript object for better performance

    res.status(200).json({
      success: true,
      data: items,
      count: items.length
    });
  } catch (error) {
    console.error('Error finding items:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching items',
      error: error.message
    });
  }
}