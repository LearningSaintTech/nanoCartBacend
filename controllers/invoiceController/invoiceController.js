const Invoice = require("../../models/Invoice/Invoice");
const { apiResponse } = require("../../utils/apiResponse");

exports.createInvoice = async (req, res) => {
  try {
    const { itemId, couponDiscount, GST, shippingCharge, islocal, isGlobal } =
      req.body;

    // Ensure only one of islocal or isGlobal is true
    if (islocal && isGlobal) {
      return res
        .status(400)
        .json(
          apiResponse(400, false, "Invoice can't be both local and global")
        );
    }

    if (islocal && !itemId) {
      return res
        .status(400)
        .json(apiResponse(400, false, "itemId is required for local invoice"));
    }

    const newInvoice = new Invoice({
      itemId: islocal ? itemId : null,
      couponDiscount,
      GST,
      shippingCharge,
      islocal,
      isGlobal,
    });

    await newInvoice.save();

    return res
      .status(201)
      .json(apiResponse(201, true, "Invoice created", newInvoice));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error creating invoice", error.message));
  }
};

exports.updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { couponDiscount, GST, shippingCharge } = req.body;

    const updatedInvoice = await Invoice.findByIdAndUpdate(
      id,
      {
        couponDiscount,
        GST,
        shippingCharge,
      },
      { new: true }
    );

    if (!updatedInvoice) {
      return res.status(404).json(apiResponse(404, false, "Invoice not found"));
    }

    return res
      .status(200)
      .json(apiResponse(200, true, "Invoice updated", updatedInvoice));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error updating invoice", error.message));
  }
};

exports.deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Invoice.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json(apiResponse(404, false, "Invoice not found"));
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

exports.getAllInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().populate("itemId", "name MRP discountedPrice");
    return res
      .status(200)
      .json(apiResponse(200, true, "All invoices", invoices));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error fetching invoices", error.message));
  }
};

exports.getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findById(id).populate("itemId", "name price");

    if (!invoice) {
      return res.status(404).json(apiResponse(404, false, "Invoice not found"));
    }

    return res
      .status(200)
      .json(apiResponse(200, true, "Invoice fetched", invoice));
  } catch (error) {
    return res
      .status(500)
      .json(apiResponse(500, false, "Error fetching invoice", error.message));
  }
};
