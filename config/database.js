const mongoose = require("mongoose");
require("dotenv").config(); // Load environment variables from .env file

exports.connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("MongoDB Connected Successfully");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1); // Exit process with failure
  }
};
