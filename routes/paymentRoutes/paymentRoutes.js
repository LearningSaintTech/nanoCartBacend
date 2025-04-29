const express = require("express");
const router = express.Router();

const { verifyPayment,createOrder } = require("../../controllers/paymentController/paymentController");

// Route to verify payment
router.post("/verify", verifyPayment);

// Route to verify payment
router.post("/verify", verifyPayment);

module.exports = router;
