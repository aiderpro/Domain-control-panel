const express = require('express');
const router = express.Router();
const CloudNSService = require('../services/cloudnsService');

// Check CloudNS configuration status
router.get('/status', async (req, res) => {
  try {
    const cloudnsService = new CloudNSService();
    
    // Load credentials and check configuration
    const credentials = await cloudnsService.loadCredentials();
    const isConfigured = await cloudnsService.isConfigured();
    
    let connectionTest = null;
    if (isConfigured) {
      connectionTest = await cloudnsService.testConnection();
    }
    
    res.json({
      success: true,
      configured: isConfigured,
      credentialsFound: !!credentials,
      credentialKeys: credentials ? Object.keys(credentials) : [],
      connectionTest: connectionTest,
      instructions: [
        '1. Create .cloudns-config file in project root',
        '2. Add AUTH_ID=your_auth_id_here',
        '3. Add AUTH_PASSWORD=your_auth_password_here',
        '4. Get credentials from CloudNS.net account settings'
      ]
    });
  } catch (error) {
    console.error('CloudNS status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      configured: false
    });
  }
});

// Test CloudNS connection
router.post('/test', async (req, res) => {
  try {
    const cloudnsService = new CloudNSService();
    const result = await cloudnsService.testConnection();
    
    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    console.error('CloudNS test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;