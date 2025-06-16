const express = require('express');
const router = express.Router();
const certbotService = require('../services/certbotService');
const sslService = require('../services/sslService');

// Install new SSL certificate
router.post('/install', async (req, res) => {
  try {
    const { domain, email } = req.body;

    if (!domain || !email) {
      return res.status(400).json({
        success: false,
        error: 'Domain and email are required',
        timestamp: new Date().toISOString()
      });
    }

    // Emit installation start status
    req.io.emit('ssl_install_start', { domain });

    const result = await certbotService.installCertificate(domain, email, req.io);

    res.json({
      success: true,
      message: `SSL certificate installed for ${domain}`,
      domain,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error installing SSL certificate:', error);
    req.io.emit('ssl_install_error', { 
      domain: req.body.domain, 
      error: error.message 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to install SSL certificate',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Renew SSL certificate
router.post('/renew', async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required',
        timestamp: new Date().toISOString()
      });
    }

    // Emit renewal start status
    req.io.emit('ssl_renew_start', { domain });

    const result = await certbotService.renewCertificate(domain, req.io);

    res.json({
      success: true,
      message: `SSL certificate renewed for ${domain}`,
      domain,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error renewing SSL certificate:', error);
    req.io.emit('ssl_renew_error', { 
      domain: req.body.domain, 
      error: error.message 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to renew SSL certificate',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Renew all certificates
router.post('/renew-all', async (req, res) => {
  try {
    req.io.emit('ssl_renew_all_start');

    const result = await certbotService.renewAllCertificates(req.io);

    res.json({
      success: true,
      message: 'All SSL certificates renewal initiated',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error renewing all SSL certificates:', error);
    req.io.emit('ssl_renew_all_error', { error: error.message });

    res.status(500).json({
      success: false,
      error: 'Failed to renew SSL certificates',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Check SSL certificate status
router.get('/status/:domain', async (req, res) => {
  try {
    const domain = req.params.domain;
    const sslInfo = await sslService.checkSSLStatus(domain);

    res.json({
      success: true,
      domain,
      ssl: sslInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error checking SSL status for ${req.params.domain}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to check SSL status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enable auto-renewal for domain
router.post('/auto-renew', async (req, res) => {
  try {
    const { domain, enabled } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await certbotService.configureAutoRenew(domain, enabled);

    res.json({
      success: true,
      message: `Auto-renewal ${enabled ? 'enabled' : 'disabled'} for ${domain}`,
      domain,
      autoRenew: enabled,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error configuring auto-renewal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to configure auto-renewal',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
