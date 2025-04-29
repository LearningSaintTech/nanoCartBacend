const express = require('express');
const router = express.Router();
const privacyPolicyController = require("../../controllers/privacyPolicyController/privacypolicyController");
const { verifyToken } = require('../middleware/VerifyToken');

// Get all Privacy Policy sections
router.get('/get',verifyToken, privacyPolicyController.getPrivacyPolicy);

// Get a specific Privacy Policy section by title

// Insert a new Privacy Policy section
router.post('/post', privacyPolicyController.createPrivacyPolicySection);


module.exports = router;