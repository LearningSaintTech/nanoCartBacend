const mongoose = require('mongoose');

const privacyPolicySchema = new mongoose.Schema({
  privacyPolicy: [
    {
      question: { type: String, required: true },
      answer: [{ type: String, required: true }]
    }
  ]
}, { timestamps: true });


module.exports = mongoose.model('PrivacyPolicy', privacyPolicySchema);
