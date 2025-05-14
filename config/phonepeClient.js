const { StandardCheckoutClient, Env } = require('pg-sdk-node'); // Updated to use pg-sdk-node
require('dotenv').config();

// Validate environment variables
const requiredEnvVars = [
  'PHONEPE_CLIENT_ID',
  'PHONEPE_CLIENT_SECRET',
  'PHONEPE_CLIENT_VERSION',
  'PHONEPE_ENV',
];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

const clientId = process.env.PHONEPE_CLIENT_ID;
const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
const clientVersion = parseInt(process.env.PHONEPE_CLIENT_VERSION, 10);
const env = process.env.PHONEPE_ENV === 'PRODUCTION' ? Env.PRODUCTION : Env.SANDBOX;

// Initialize PhonePe StandardCheckoutClient
const client = StandardCheckoutClient.getInstance(clientId, clientSecret, clientVersion, env);

module.exports = client;