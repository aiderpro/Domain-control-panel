const express = require('express');
const router = express.Router();
const CloudNSService = require('../services/cloudnsService');

// Get CloudNS configuration status
router.get('/status', async (req, res) => {
  try {
    const cloudnsService = new CloudNSService();
    const isConfigured = cloudnsService.isConfigured();
    
    if (isConfigured) {
      // Test the connection
      const testResult = await cloudnsService.testConnection();
      res.json({
        success: true,
        configured: true,
        connected: testResult.success,
        message: testResult.message
      });
    } else {
      res.json({
        success: true,
        configured: false,
        connected: false,
        message: 'CloudNS credentials not configured'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check CloudNS status',
      message: error.message
    });
  }
});

// Test CloudNS connection
router.post('/test', async (req, res) => {
  try {
    const cloudnsService = new CloudNSService();
    const result = await cloudnsService.testConnection();
    
    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'CloudNS connection test failed',
      message: error.message
    });
  }
});

module.exports = router;