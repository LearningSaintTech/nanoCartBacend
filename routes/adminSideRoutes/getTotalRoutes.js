const express = require('express');
const router = express.Router();
const totalsController = require('../../controllers/adminSideController/getTotal');

// GET /api/totals - Get total counts of Users, Partners, Categories, Subcategories, and Items
router.get('/', totalsController.getTotals);

module.exports = router;