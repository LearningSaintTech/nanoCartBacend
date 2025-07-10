const express = require('express');
const router = express.Router();

const {createTBYBEntry}=require("../../controllers/userTBYBController/userTBYBController")
const {verifyToken}=require("../../middlewares/verifyToken")
const {isUser}=require("../../middlewares/isUser")

// POST /api/tbyb — create TBYB entry
router.post("/", verifyToken,isUser, createTBYBEntry);

module.exports = router