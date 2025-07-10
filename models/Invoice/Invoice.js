const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema(
  {
    invoice: [
      {
        key: {
          type: String,
          required: true,
          trim: true,
          lowercase: true,
        },
        value: {
          type: Number,
          required: true,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports= mongoose.model("Invoice", InvoiceSchema);

