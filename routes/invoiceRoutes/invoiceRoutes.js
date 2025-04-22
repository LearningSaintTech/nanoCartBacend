const express = require("express");
const router = express.Router();
const {
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getAllInvoices,
  getInvoiceById,
} = require("../../controllers/invoiceController/invoiceController")

const { verifyToken } = require("../../middlewares/verifyToken");
const { isAdmin } = require("../../middlewares/isAdmin");

router.post("/create", verifyToken, isAdmin, createInvoice);
router.put("/:id", verifyToken, isAdmin, updateInvoice);
router.delete("/:id", verifyToken, isAdmin, deleteInvoice);
router.get("/", verifyToken, isAdmin, getAllInvoices);
router.get("/:id", verifyToken, isAdmin, getInvoiceById);

module.exports = router;
