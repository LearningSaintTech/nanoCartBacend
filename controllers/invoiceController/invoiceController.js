const Invoice = require("../../models/Invoice/Invoice");
const { apiResponse } = require("../../utils/apiResponse");
const mongoose=require("mongoose")


// Create a new invoice
exports.createInvoice = async (req, res) => {
  try {
    const { invoice } = req.body;

    const newInvoice = new Invoice({ invoice });
    const savedInvoice = await newInvoice.save();

    return res.status(201).json(
      apiResponse(201, true, "Invoice created successfully", savedInvoice)
    );
  } catch (error) {
    console.error("Error creating invoice:", error);
    return res
      .status(500)
      .json(apiResponse(500, false, "Error creating invoice", error.message));
  }
};

// Get invoice by ID
exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Invoice not found"));
    }

    return res
      .status(200)
      .json(apiResponse(200, true, "Invoice fetched successfully", invoice));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error fetching invoice", error.message));
  }
};

// Get all invoices
exports.getAllInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 });

    return res
      .status(200)
      .json(apiResponse(200, true, "Invoices fetched successfully", invoices));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error fetching invoices", error.message));
  }
};

// Update an invoice
exports.updateInvoice = async (req, res) => {
  try {
    const { invoice } = req.body;

    const updatedInvoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { invoice, updatedAt: Date.now() },
      { new: true }
    );

    if (!updatedInvoice) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Invoice not found"));
    }

    return res
      .status(200)
      .json(apiResponse(200, true, "Invoice updated successfully", updatedInvoice));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error updating invoice", error.message));
  }
};

// Delete an invoice
exports.deleteAllInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);

    if (!invoice) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Invoice not found"));
    }

    return res
      .status(200)
      .json(apiResponse(200, true, "Invoice deleted successfully"));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error deleting invoice", error.message));
  }
};


// Delete a specific entry from invoice array by entryId
// Route: DELETE /invoices/:id/entry/:entryId
exports.deleteSpecificInvoice = async (req, res) => {
  try {
    const { id, entryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(400).json(apiResponse(400, false, "Invalid entryId"));
    }

    const updatedInvoice = await Invoice.findByIdAndUpdate(
      id,
      { $pull: { invoice: { _id: entryId } } },
      { new: true }
    );

    if (!updatedInvoice) {
      return res
        .status(404)
        .json(apiResponse(404, false, "Invoice not found"));
    }

    return res
      .status(200)
      .json(apiResponse(200, true, "Invoice entry deleted successfully", updatedInvoice));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error deleting invoice entry", error.message));
  }
};
