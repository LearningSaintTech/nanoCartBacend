const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
  },
  couponDiscount: {
    type: Number,
  },
  GST: {
    type: Number,
  },
  shippingCharge: {
    type: Number,
  },
  islocal: {
    type: Boolean,
  },
  isGlobal: {
    type: Boolean,
  },
});

module.exports = mongoose.model("Invoice", invoiceSchema);
