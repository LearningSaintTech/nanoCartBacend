const mongoose = require("mongoose");

const AddressSchema = new mongoose.Schema(
  {
    partnerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
    },
    fullName: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^\d{6}$/.test(v);
        },
        message: (props) => `${props.value} is not a valid postal code!`,
      },
    },
    country: { type: String, required: true, default: "India" },
    phone: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^\d{10}$/.test(v);
        },
        message: (props) => `${props.value} is not a valid phone number!`,
      },
    },
    addressType: {
      type: String,
      enum: ["Home", "Work"],
      default: "Home",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Address = mongoose.model("PartnerAddress", AddressSchema);

module.exports = Address;
