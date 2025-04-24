const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      trim: true,
      lowercase: true,
    },
    values: [
      {
        type: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);
