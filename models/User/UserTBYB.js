const mongoose = require("mongoose");
const { MAX } = require("uuid");

const TBYBSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  images: [
    {
      itemImage:{
         type: String,
        required: true,
      },
      userImage: {
        type: String,
        required: true,
      },
      TBYBImage: {
        type: String,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,  // Stores the time when the image was uploaded
      },
    },
  ],
  trialOnNumber:{
    type:Number,
    default:0,
    MAX:10
  }
});

module.exports = mongoose.model("UserTBYB", TBYBSchema);
