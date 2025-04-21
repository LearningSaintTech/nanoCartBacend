const express = require("express");
const router = express.Router();
const multer = require("multer");


const upload = multer({ limits: { files: 20 } });

const {
  createItemDetail,
  updateItemDetail,
  deleteItemDetail,
  getItemDetailsByItemId,
  getItemDetailById,
} = require("../../controllers/itemDetailsController/itemDetails");

const { verifyToken } = require("../../middlewares/verifyToken");
const { isAdmin } = require("../../middlewares/isAdmin");

// Create new ItemDetail
router.post(
  "/create",
  verifyToken, isAdmin,
  upload.any(), // for multiple color image uploads like red, blue...
  createItemDetail
);

// Update existing ItemDetail by ID
router.put(
  "/:itemDetailsId",
  verifyToken, isAdmin,
  upload.any(), // to allow image + other data update
  updateItemDetail
);

// Delete ItemDetail by ID
router.delete("/:itemDetailsId",  verifyToken, isAdmin, deleteItemDetail);


// Get all ItemDetails by item ID
router.get("/:itemId", getItemDetailsByItemId);


// Get a ItemDetail by itemDetailsID
router.get("/id/:itemDetailsId", getItemDetailById);

module.exports = router;
