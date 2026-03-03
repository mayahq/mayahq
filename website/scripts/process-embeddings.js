#!/usr/bin/env node

/**
 * Script to process memory embeddings
 * This can be run as a cron job to periodically generate embeddings for memories
 * that don't have them yet.
 * 
 * Usage:
 *   node process-embeddings.js [batchSize]
 * 
 * Options:
 *   batchSize - Number of memories to process in one batch (default: 50)
 */

const https = require('https');
require('dotenv').config();

// Configuration
const API_URL = process.env.EMBEDDING_API_URL || 'https://mayahq-website.vercel.app/api/generate-embeddings';
const API_KEY = process.env.EMBEDDING_GENERATION_API_KEY;
const BATCH_SIZE = parseInt(process.argv[2]) || 50;

if (!API_KEY) {
  console.error('Error: EMBEDDING_GENERATION_API_KEY environment variable is required');
  process.exit(1);
}

console.log(`Processing embeddings with batch size: ${BATCH_SIZE}`);

// Prepare the request data
const data = JSON.stringify({
  batchSize: BATCH_SIZE
});

// Configure the request options
const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    'Content-Length': data.length
  }
};

// Send the request
const req = https.request(API_URL, options, (res) => {
  let responseData = '';
  
  // Collect the response data
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  // Process the response
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const result = JSON.parse(responseData);
        console.log(`Embedding generation complete. Processed: ${result.processed}, Successful: ${result.successful}`);
        process.exit(0);
      } catch (e) {
        console.error('Error parsing response:', e);
        console.error('Raw response:', responseData);
        process.exit(1);
      }
    } else {
      console.error(`Request failed with status code: ${res.statusCode}`);
      console.error('Response:', responseData);
      process.exit(1);
    }
  });
});

// Handle errors
req.on('error', (error) => {
  console.error('Request error:', error);
  process.exit(1);
});

// Send the request data
req.write(data);
req.end();

console.log('Embedding generation request sent, waiting for response...'); 