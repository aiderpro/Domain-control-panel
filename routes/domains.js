const express = require('express');
const router = express.Router();
const nginxService = require('../services/nginxService');
const sslService = require('../services/sslService');

// Get all domains from nginx sites-available
router.get('/', async (req, res) => {
  try {
    const domains = await nginxService.scanDomains();
    
    // Enhance domains with SSL information
    const domainsWithSSL = domains.map((domain) => {
      try {
        const sslInfo = sslService.getDemoSSLStatus(domain.domain);
        return {
          ...domain,
          ssl: sslInfo
        };
      } catch (error) {
        return {
          ...domain,
          ssl: {
            status: 'error',
            error: error.message,
            hasSSL: false
          }
        };
      }
    });

    res.json({
      success: true,
      domains: domainsWithSSL,
      total: domainsWithSSL.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching domains:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch domains',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get specific domain details
router.get('/domain/:domain', async (req, res) => {
  try {
    const domain = req.params.domain;
    const domainConfig = await nginxService.getDomainConfig(domain);
    const sslInfo = await sslService.checkSSLStatus(domain);

    res.json({
      success: true,
      domain: {
        ...domainConfig,
        ssl: sslInfo
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error fetching domain ${req.params.domain}:`, error);
    res.status(404).json({
      success: false,
      error: 'Domain not found',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Refresh domain list
router.post('/refresh', async (req, res) => {
  try {
    // Emit refresh status to connected clients
    req.io.emit('domain_refresh_start');
    
    const domains = await nginxService.scanDomains();
    
    req.io.emit('domain_refresh_complete', { count: domains.length });
    
    res.json({
      success: true,
      message: 'Domain list refreshed',
      count: domains.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error refreshing domains:', error);
    req.io.emit('domain_refresh_error', { error: error.message });
    
    res.status(500).json({
      success: false,
      error: 'Failed to refresh domains',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
