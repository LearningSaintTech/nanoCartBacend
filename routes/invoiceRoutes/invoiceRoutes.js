const mongoose=require("mongoose")
const express = require("express");
const router = express.Router();
const {
  createInvoice,
  updateInvoice,
  deleteAllInvoice,
  deleteSpecificInvoice,
  getAllInvoices,
  getInvoiceById,
} = require("../../controllers/invoiceController/invoiceController")

const { verifyToken } = require("../../middlewares/verifyToken");
const { isAdmin } = require("../../middlewares/isAdmin");

router.post("/create", verifyToken, isAdmin, createInvoice);
router.put("/:id", verifyToken, isAdmin, updateInvoice);
router.delete("/:id", verifyToken, isAdmin, deleteAllInvoice);
router.delete("/:id/entry/:entryId",verifyToken, isAdmin,deleteSpecificInvoice);
router.get("/", getAllInvoices);


module.exports = router;
