const express = require('express');
const router = express.Router();
const totalsController = require('../../controllers/adminSideController/getTotal');
const {verifyToken}=require("../../middlewares/verifyToken");
const {isAdmin}=require("../../middlewares/isAdmin")

// GET /api/totals - Get total counts of Users, Partners, Categories, Subcategories, and Items
router.get('/', verifyToken,isAdmin,totalsController.getTotals);

module.exports = router;