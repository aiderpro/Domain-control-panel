#!/bin/bash

# Direct SSL test for production server
# Run this on your production server to verify SSL service is updated

echo "Testing SSL service on production server..."

# Test the SSL service directly with Node.js
node -e "
const sslService = require('./services/sslService');
(async () => {
  console.log('Testing a3cabscochin.com SSL service...');
  const result = await sslService.checkSSLStatus('a3cabscochin.com');
  console.log('SSL Result:');
  console.log(JSON.stringify(result, null, 2));
  
  if (result && result.expiryDate) {
    const expiryDate = new Date(result.expiryDate);
    if (expiryDate.getMonth() === 8 && expiryDate.getDate() === 15) {
      console.log('❌ PROBLEM: Still showing September 15th demo data');
      console.log('The SSL service needs to be updated on this server');
    } else {
      console.log('✅ SUCCESS: Showing authentic certificate data');
      console.log('Expected: July 23, 2025 for a3cabscochin.com');
    }
  } else {
    console.log('❌ No SSL data returned');
  }
})();
"

echo "SSL test completed."