const Invoice = require("../../models/Invoice/Invoice");
const mongoose = require("mongoose");
const { apiResponse } = require("../../utils/apiResponse");


// Create or update an invoice
exports.createInvoice = async (req, res) => {
  try {
    const { invoice } = req.body;

    // Validate invoice
    if (!Array.isArray(invoice) || invoice.length === 0) {
      return res.status(400).json(apiResponse(400, false, "Invoice must be a non-empty array"));
    }

    // Validate each invoice entry
    for (const entry of invoice) {
      if (!entry.key || typeof entry.key !== "string" || entry.key.trim() === "") {
        return res.status(400).json(apiResponse(400, false, "Each invoice entry must have a valid key"));
      }
      if (!entry.values || typeof entry.values !== "string" || entry.values.trim() === "") {
        return res.status(400).json(apiResponse(400, false, "Each invoice entry must have valid values"));
      }
    }

    // Check if an invoice document already exists
    const existingInvoice = await Invoice.findOne();

    if (!existingInvoice) {
      // No invoice exists, create a new one
      const newInvoice = new Invoice({ invoice });
      const savedInvoice = await newInvoice.save();
      return res.status(201).json(
        apiResponse(201, true, "Invoice created successfully", savedInvoice)
      );
    }

    // Invoice exists, append new entries to the existing invoice array
    existingInvoice.invoice.push(...invoice);
    const updatedInvoice = await existingInvoice.save();

    return res.status(200).json(
      apiResponse(200, true, "Invoice entries added successfully", updatedInvoice)
    );
  } catch (error) {
    console.error("Error processing invoice:", error);
    return res.status(500).json(
      apiResponse(500, false, "Error processing invoice", { error: error.message })
    );
  }
};

// Get all invoices
exports.getAllInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 }).lean();

    if (!invoices || invoices.length === 0) {
      return res.status(404).json(apiResponse(404, false, "No invoices found"));
    }

    return res.status(200).json(
      apiResponse(200, true, "Invoices fetched successfully", invoices)
    );
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return res.status(500).json(
      apiResponse(500, false, "Error fetching invoices", { error: error.message })
    );
  }
};

// Update a specific invoice entry (only the values field)
exports.updateSpecificInvoice = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const { values } = req.body;

    // Validate invoice ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json(apiResponse(400, false, "Invalid invoice ID"));
    }

    // Validate entryId
    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid entryId"));
    }

    // Validate values
    if (!values || typeof values !== "string" || values.trim() === "") {
      return res.status(400).json(apiResponse(400, false, "Valid values field is required"));
    }

    // Update the specific invoice entry's values
    const updatedInvoice = await Invoice.findOneAndUpdate(
      { _id: id, "invoice._id": entryId },
      { $set: { "invoice.$.values": values, updatedAt: Date.now() } },
      { new: true }
    );

    if (!updatedInvoice) {
      return res.status(404).json(
        apiResponse(404, false, "Invoice or entry not found")
      );
    }

    return res.status(200).json(
      apiResponse(200, true, "Invoice entry updated successfully", updatedInvoice)
    );
  } catch (error) {
    console.error("Error updating invoice:", error);
    return res.status(500).json(
      apiResponse(500, false, "Error updating invoice entry", { error: error.message })
    );
  }
};

// Delete an entire invoice
exports.deleteAllInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate invoice ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json(apiResponse(400, false, "Invalid invoice ID"));
    }

    const invoice = await Invoice.findByIdAndDelete(id);

    if (!invoice) {
      return res.status(404).json(apiResponse(404, false, "Invoice not found"));
    }

    return res.status(200).json(
      apiResponse(200, true, "Invoice deleted successfully")
    );
  } catch (error) {
    console.error("Error deleting invoice:", error);
    return res.status(500).json(
      apiResponse(500, false, "Error deleting invoice", { error: error.message })
    );
  }
};

// Delete a specific entry from invoice array by entryId
exports.deleteSpecificInvoice = async (req, res) => {
  try {
    const { id, entryId } = req.params;

    // Validate invoice ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json(apiResponse(400, false, "Invalid invoice ID"));
    }

    // Validate entryId
    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid entryId"));
    }

    // Remove the specific invoice entry
    const updatedInvoice = await Invoice.findByIdAndUpdate(
      id,
      { $pull: { invoice: { _id: entryId } } },
      { new: true }
    );

    if (!updatedInvoice) {
      return res.status(404).json(apiResponse(404, false, "Invoice or entry not found"));
    }

    return res.status(200).json(
      apiResponse(200, true, "Invoice entry deleted successfully", updatedInvoice)
    );
  } catch (error) {
    console.error("Error deleting invoice entry:", error);
    return res.status(500).json(
      apiResponse(500, false, "Error deleting invoice entry", { error: error.message })
    );
  }
};