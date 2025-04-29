// config/razorpay.js
const Razorpay = require("razorpay");
require("dotenv").config()
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,      // keep in .env file
  key_secret: process.env.RAZORPAY_KEY_SECRET, // keep in .env file
});

module.exports = razorpay;
