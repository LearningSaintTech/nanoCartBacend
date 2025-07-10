const { StandardCheckoutClient, Env } = require('pg-sdk-node'); // Updated to use pg-sdk-node
require('dotenv').config();


const clientId = process.env.PHONEPE_CLIENT_ID;
const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
const clientVersion = parseInt(process.env.PHONEPE_CLIENT_VERSION, 10);
const env = process.env.PHONEPE_ENV === 'PRODUCTION' ? Env.PRODUCTION : Env.SANDBOX;

// Initialize PhonePe StandardCheckoutClient
const phonepeClient = StandardCheckoutClient.getInstance(clientId, clientSecret, clientVersion, env);

module.exports = phonepeClient;