const Filter = require("../../models/Filter/Filter");
const {apiResponse} = require("../../utils/apiResponse");

// Create Filter
exports.createFilter = async (req, res) => {
  try {
    const { key, values } = req.body;

    if (!key || !values || !Array.isArray(values) || values.length === 0) {
      return res.status(400).json(apiResponse(400, false, "Key and values are required"));
    }

    const newFilter = new Filter({ key, values });
    const savedFilter = await newFilter.save();

    res.status(201).json(apiResponse(201, true, "Filter created", savedFilter));
  } catch (err) {
    res.status(500).json(apiResponse(500, false, err.message));
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
    const { key, values } = req.body;
    const updated = await Filter.findByIdAndUpdate(
      req.params.id,
      { key, values },
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
