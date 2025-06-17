// Add this test endpoint to your production server's routes
// This bypasses authentication to test SSL service directly

const express = require('express');
const router = express.Router();
const sslService = require('../services/sslService');

// Test SSL service without authentication
router.get('/test-ssl/:domain', async (req, res) => {
  try {
    const domain = req.params.domain;
    console.log(`Testing SSL for ${domain}...`);
    
    const sslData = await sslService.checkSSLStatus(domain);
    
    res.json({
      success: true,
      domain,
      ssl: sslData,
      timestamp: new Date().toISOString(),
      note: 'SSL test endpoint - bypasses authentication'
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;