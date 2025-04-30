const Filter = require("../../models/Filter/Filter");
const {apiResponse} = require("../../utils/apiResponse");

// Helper to capitalize first letter
const capitalizeFirst = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

exports.createFilter = async (req, res) => {
  try {
    let { key, values } = req.body;

    // Validate input
    if (!key || !values || !Array.isArray(values) || values.length === 0) {
      return res
        .status(400)
        .json(apiResponse(400, false, "Key and values are required"));
    }

    // Capitalize key and values
    const formattedKey = capitalizeFirst(key.trim());
    const formattedValues = values.map((val) => capitalizeFirst(val.trim()));

    // Check if a filter with the same key already exists
    const existingFilter = await Filter.findOne({ key: formattedKey });

    if (existingFilter) {
      return res
        .status(409)
        .json(apiResponse(409, false, "Filter with this key already exists"));
    }

    // Save new filter
    const newFilter = new Filter({
      key: formattedKey,
      values: formattedValues,
    });

    const savedFilter = await newFilter.save();

    return res
      .status(201)
      .json(apiResponse(201, true, "Filter created", savedFilter));
  } catch (err) {
    return res
      .status(500)
      .json(apiResponse(500, false, err.message));
  }
};

// Read All Filters
exports.getAllFilters = async (req, res) => {
  try {
    const filters = await Filter.find();
    res.status(200).json(apiResponse(200, true, "Filters fetched", filters));
  } catch (err) {
    res.status(500).json(apiResponse(500, false, err.message));
  }
};

// Read Single Filter by ID
exports.getFilterById = async (req, res) => {
  try {
    const filter = await Filter.findById(req.params.id);
    if (!filter) {
      return res.status(404).json(apiResponse(404, false, "Filter not found"));
    }
    res.status(200).json(apiResponse(200, true, "Filter fetched", filter));
  } catch (err) {
    res.status(500).json(apiResponse(500, false, err.message));
  }
};

// Update Filter
exports.updateFilter = async (req, res) => {
  try {
    let {values} = req.body;

    // Capitalize key and values
    const formattedValues = values.map((val) => capitalizeFirst(val.trim()));

    const updated = await Filter.findByIdAndUpdate(
      req.params.id,
      {values: formattedValues },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json(apiResponse(404, false, "Filter not found"));
    }

    res.status(200).json(apiResponse(200, true, "Filter updated", updated));
  } catch (err) {
    res.status(500).json(apiResponse(500, false, err.message));
  }
};

// Delete Filter
exports.deleteFilter = async (req, res) => {
  try {
    const deleted = await Filter.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json(apiResponse(404, false, "Filter not found"));
    }
    res.status(200).json(apiResponse(200, true, "Filter deleted"));
  } catch (err) {
    res.status(500).json(apiResponse(500, false, err.message));
  }
};
