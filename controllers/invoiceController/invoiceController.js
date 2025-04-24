const Invoice = require("../../models/Invoice/Invoice");
const {apiResponse}=require("../../")



// Create a new invoice
exports.createInvoice = async (req, res) => {
  try {
    const { key, values } = req.body;

    const newInvoice = new Invoice({
      key,
      values,
    });

    const savedInvoice = await newInvoice.save();

    return apiResponse(res, 201, true, "Invoice created successfully", savedInvoice);
  } catch (error) {
    return apiResponse(res, 500, false, "Error creating invoice");
  }
};

// Get invoice by ID
exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return apiResponse(res, 404, false, "Invoice not found");
    }

    return apiResponse(res, 200, true, "Invoice fetched successfully", invoice);
  } catch (error) {
    return apiResponse(res, 500, false, "Error fetching invoice");
  }
};

// Get all invoices
exports.getAllInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 });

    return apiResponse(res, 200, true, "Invoices fetched successfully", invoices);
  } catch (error) {
    return apiResponse(res, 500, false, "Error fetching invoices");
  }
};

// Update an invoice
exports.updateInvoice = async (req, res) => {
  try {
    const { key, values } = req.body;

    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { key, values, updatedAt: Date.now() },
      { new: true }
    );

    if (!invoice) {
      return apiResponse(res, 404, false, "Invoice not found");
    }

    return apiResponse(res, 200, true, "Invoice updated successfully", invoice);
  } catch (error) {
    return apiResponse(res, 500, false, "Error updating invoice");
  }
};

// Delete an invoice
exports.deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);

    if (!invoice) {
      return apiResponse(res, 404, false, "Invoice not found");
    }

    return apiResponse(res, 200, true, "Invoice deleted successfully");
  } catch (error) {
    return apiResponse(res, 500, false, "Error deleting invoice");
  }
};