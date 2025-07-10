const express = require("express");
const router = express.Router();
const {
  createInvoice,
  updateSpecificInvoice,
  deleteAllInvoice,
  deleteSpecificInvoice,
  getAllInvoices,
  createSpecificInvoice
} = require("../../controllers/invoiceController/invoiceController");
const { verifyToken } = require("../../middlewares/verifyToken");
const { isAdmin } = require("../../middlewares/isAdmin");

// Create a new invoice
router.post("/create", verifyToken, isAdmin, createInvoice);

// Create a specific invoice entry in an existing invoice
router.post("/:id/entry", verifyToken, isAdmin, createSpecificInvoice);

// Update a specific invoice entry
router.put("/:id/entry/:entryId", verifyToken, isAdmin, updateSpecificInvoice);

// Delete an entire invoice
router.delete("/:id", verifyToken, isAdmin, deleteAllInvoice);

// Delete a specific invoice entry
router.delete("/:id/entry/:entryId", verifyToken, isAdmin, deleteSpecificInvoice);

// Get all invoices
router.get("/", getAllInvoices);

module.exports = router;