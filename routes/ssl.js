const express = require('express');
const router = express.Router();
const certbotService = require('../services/certbotService');
const sslService = require('../services/sslService');

// Install new SSL certificate
router.post('/install', async (req, res) => {
  try {
    let { domain, email, method = 'nginx' } = req.body;

    if (!domain || !email) {
      return res.status(400).json({
        success: false,
        error: 'Domain and email are required',
        timestamp: new Date().toISOString()
      });
    }

    // Remove www prefix if present to normalize domain
    const normalizedDomain = domain.replace(/^www\./, '');

    // Validate method
    if (!['nginx', 'dns'].includes(method)) {
      return res.status(400).json({
        success: false,
        error: 'Method must be either "nginx" or "dns"',
        timestamp: new Date().toISOString()
      });
    }

    // Emit installation start status
    req.io.emit('ssl_install_start', { domain: normalizedDomain, method });

    const result = await certbotService.installCertificate(normalizedDomain, email, method, req.io);

    // Auto-enable autorenewal for successful SSL installations
    if (result.success) {
      try {
        const fs = require('fs').promises;
        const path = require('path');
        
        // Load autorenewal configuration
        const CONFIG_DIR = path.join(__dirname, '..', 'data');
        const AUTORENEWAL_CONFIG_FILE = path.join(CONFIG_DIR, 'autorenewal.json');
        
        let config;
        try {
          await fs.mkdir(CONFIG_DIR, { recursive: true });
          const configData = await fs.readFile(AUTORENEWAL_CONFIG_FILE, 'utf8');
          config = JSON.parse(configData);
        } catch (error) {
          // Create default config if not exists
          config = {
            globalEnabled: true,
            renewalDays: 30,
            checkFrequency: 'daily',
            domains: {},
            lastCheck: null,
            statistics: {
              totalRenewals: 0,
              successfulRenewals: 0,
              failedRenewals: 0,
              lastRenewalDate: null
            }
          };
        }
        
        // Enable autorenewal for this domain
        config.domains[normalizedDomain] = {
          enabled: true,
          lastRenewal: new Date().toISOString(),
          nextCheck: null,
          status: 'active',
          method: method,
          autoEnabledAt: new Date().toISOString()
        };
        
        // Save updated config
        await fs.writeFile(AUTORENEWAL_CONFIG_FILE, JSON.stringify(config, null, 2));
        
        console.log(`Auto-enabled SSL autorenewal for ${normalizedDomain}`);
      } catch (autoRenewalError) {
        console.error('Failed to auto-enable autorenewal:', autoRenewalError);
        // Don't fail the SSL installation if autorenewal setup fails
      }
    }

    res.json({
      success: true,
      message: `SSL certificate installation started for ${normalizedDomain} (including www.${normalizedDomain}) using ${method} method. Autorenewal enabled automatically.`,
      domain: normalizedDomain,
      method,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error installing SSL certificate:', error);
    
    const errorMessage = error.message;
    const isConfigurationError = errorMessage.includes('CloudNS credentials not configured') || 
                                errorMessage.includes('DNS SSL installation requires server-side') ||
                                errorMessage.includes('CloudNS API connection failed');
    
    const statusCode = isConfigurationError ? 400 : 500;
    
    req.io.emit('ssl_install_error', { 
      domain: req.body.domain, 
      method: req.body.method || 'nginx',
      error: errorMessage 
    });

    res.status(statusCode).json({
      success: false,
      error: isConfigurationError ? 'Configuration required' : 'Installation failed',
      message: errorMessage,
      domain: req.body.domain,
      method: req.body.method || 'nginx',
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
