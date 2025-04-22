const mongoose = require("mongoose");

const AddressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
      index: true,
    },

    addressDetail: [
      {
        name: { type: String, required: true },
        phoneNumber: {
          type: String,
          required: true,
          validate: {
            validator: function (v) {
              return /^\d{10}$/.test(v);
            },
            message: (props) => `${props.value} is not a valid phone number!`,
          },
        },
        email: {
          type: String,
          validate: {
            validator: function (v) {
              return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: (props) => `${props.value} is not a valid email address!`,
          },
        },
        pincode: {
          type: String,
          required: true,
          validate: {
            validator: function (v) {
              return /^\d{6}$/.test(v);
            },
            message: (props) => `${props.value} is not a valid postal code!`,
          },
        },
        addressLine1: { type: String, required: true },
        addressLine2: { type: String },
        cityTown: { type: String, required: true },
        state: { type: String, required: true },
        country: { type: String, required: true },

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
    ],
  },
  { timestamps: true }
);

const Address = mongoose.model("PartnerAddress", AddressSchema);

module.exports = Address;
