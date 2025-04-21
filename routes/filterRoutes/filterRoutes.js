const express = require("express");
const router = express.Router();
const filterController = require("../../controllers/filterController/filterController");
const {verifyToken}=require("../../middlewares/verifyToken");
const {isAdmin}=require("../../middlewares/isAdmin")

//routes to create filter
router.post("/create", verifyToken,isAdmin,filterController.createFilter);

//routes to update filter
router.put("/:id",verifyToken,isAdmin, filterController.updateFilter);

//routes to delete filter
router.delete("/:id",verifyToken,isAdmin, filterController.deleteFilter);

//routes to get all filter
router.get("/", filterController.getAllFilters); 

//routes to get filter by id
router.get("/:id",filterController.getFilterById);


module.exports = router;
