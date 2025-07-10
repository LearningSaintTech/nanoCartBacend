const { StandardCheckoutClient } = require('pg-sdk-node');

let phonepeClientInstance = null;

const initializePhonePeClient = () => {
  if (!phonepeClientInstance) {
    try {
      phonepeClientInstance = StandardCheckoutClient.getInstance(
        process.env.PHONEPE_CLIENT_ID,
         process.env.PHONEPE_CLIENT_SECRET,
        process.env.PHONEPE_CLIENT_VERSION,
        'production'
      );
      console.log(`[${new Date().toISOString()}] PhonePe client initialized successfully`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to initialize PhonePe client: ${error.message}`);
      throw error;
    }
  }
  return phonepeClientInstance;
};

module.exports = initializePhonePeClient;