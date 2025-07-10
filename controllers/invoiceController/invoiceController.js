const Invoice = require("../../models/Invoice/Invoice");
const mongoose = require("mongoose");
const { apiResponse } = require("../../utils/apiResponse");



// ✅ Create or update an invoice
exports.createInvoice = async (req, res) => {
  try {
    const { invoice } = req.body;

    if (!Array.isArray(invoice) || invoice.length === 0) {
      return res.status(400).json(apiResponse(400, false, "Invoice must be a non-empty array"));
    }

    const existingInvoice = await Invoice.findOne();

    if (!existingInvoice) {
      const newInvoice = new Invoice({ invoice });
      const savedInvoice = await newInvoice.save();
      return res.status(201).json(apiResponse(201, true, "Invoice created successfully", savedInvoice));
    }

    existingInvoice.invoice.push(...invoice);
    const updatedInvoice = await existingInvoice.save();

    return res.status(200).json(apiResponse(200, true, "Invoice entries added successfully", updatedInvoice));
  } catch (error) {
    console.error("Error processing invoice:", error);
    return res.status(500).json(apiResponse(500, false, "Error processing invoice", { error: error.message }));
  }
};

// ✅ Create a specific invoice entry in an existing invoice
exports.createSpecificInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { key, value } = req.body;

    // Validate invoice ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json(apiResponse(400, false, "Invalid invoice ID"));
    }

    // Validate input
    if (!key || typeof key !== "string" || key.trim() === "") {
      return res.status(400).json(apiResponse(400, false, "A valid 'key' string is required"));
    }
    if (typeof value !== "number") {
      return res.status(400).json(apiResponse(400, false, "A valid numeric 'value' is required"));
    }

    // Find the invoice and add new entry
    const updatedInvoice = await Invoice.findByIdAndUpdate(
      id,
      {
        $push: {
          invoice: {
            key: key.trim().toLowerCase(),
            value
          }
        }
      },
      { new: true }
    );

    if (!updatedInvoice) {
      return res.status(404).json(apiResponse(404, false, "Invoice not found"));
    }

    return res.status(200).json(apiResponse(200, true, "Invoice entry created successfully", updatedInvoice));
  } catch (error) {
    console.error("Error creating invoice entry:", error);
    return res.status(500).json(apiResponse(500, false, "Error creating invoice entry", { error: error.message }));
  }
};


// ✅ Update a specific invoice entry (only the value field)
exports.updateSpecificInvoice = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const { value } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid invoice or entry ID"));
    }

    if (typeof value !== "number") {
      return res.status(400).json(apiResponse(400, false, "A valid numeric 'value' is required"));
    }

    const updatedInvoice = await Invoice.findOneAndUpdate(
      { _id: id, "invoice._id": entryId },
      { $set: { "invoice.$.value": value } },
      { new: true }
    );

    if (!updatedInvoice) {
      return res.status(404).json(apiResponse(404, false, "Invoice or entry not found"));
    }

    return res.status(200).json(apiResponse(200, true, "Invoice entry updated successfully", updatedInvoice));
  } catch (error) {
    console.error("Error updating invoice:", error);
    return res.status(500).json(apiResponse(500, false, "Error updating invoice entry", { error: error.message }));
  }
};


// ✅ Get all invoices
exports.getAllInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 }).lean();

    if (!invoices || invoices.length === 0) {
      return res.status(404).json(apiResponse(404, false, "No invoices found"));
    }

    return res.status(200).json(apiResponse(200, true, "Invoices fetched successfully", invoices));
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return res.status(500).json(apiResponse(500, false, "Error fetching invoices", { error: error.message }));
  }
};



// ✅ Delete an entire invoice document
exports.deleteAllInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json(apiResponse(400, false, "Invalid invoice ID"));
    }

    const invoice = await Invoice.findByIdAndDelete(id);

    if (!invoice) {
      return res.status(404).json(apiResponse(404, false, "Invoice not found"));
    }

    return res.status(200).json(apiResponse(200, true, "Invoice deleted successfully"));
  } catch (error) {
    console.error("Error deleting invoice:", error);
    return res.status(500).json(apiResponse(500, false, "Error deleting invoice", { error: error.message }));
  }
};

// ✅ Delete a specific entry from invoice array
exports.deleteSpecificInvoice = async (req, res) => {
  try {
    const { id, entryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid invoice or entry ID"));
    }

    const updatedInvoice = await Invoice.findByIdAndUpdate(
      id,
      { $pull: { invoice: { _id: entryId } } },
      { new: true }
    );

    if (!updatedInvoice) {
      return res.status(404).json(apiResponse(404, false, "Invoice or entry not found"));
    }

    return res.status(200).json(apiResponse(200, true, "Invoice entry deleted successfully", updatedInvoice));
  } catch (error) {
    console.error("Error deleting invoice entry:", error);
    return res.status(500).json(apiResponse(500, false, "Error deleting invoice entry", { error: error.message }));
  }
};
