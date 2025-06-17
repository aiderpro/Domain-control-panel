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

    // Immediately refresh SSL data after renewal
    setTimeout(async () => {
      try {
        const sslService = require('../services/sslService');
        
        // Wait a moment for file system to update
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const freshSSLData = await sslService.checkSSLStatus(domain);
        console.log(`Post-renewal SSL refresh for ${domain}:`, {
          expires: freshSSLData?.expiryDate,
          daysRemaining: freshSSLData?.daysUntilExpiry,
          issued: freshSSLData?.issuedDate,
          hasSSL: freshSSLData?.hasSSL
        });
        
        // Emit updated SSL data to all connected clients
        req.io.emit('ssl_data_refreshed', {
          domain,
          ssl: freshSSLData
        });
        
        // Also emit a general refresh trigger
        req.io.emit('domain_refresh_needed');
        
      } catch (error) {
        console.log(`Failed to refresh SSL data after renewal:`, error.message);
      }
    }, 3000);

    res.json({
      success: true,
      message: `SSL certificate renewed for ${domain}. Updated certificate data will be available shortly.`,
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
    const domain = decodeURIComponent(req.params.domain);
    console.log(`Checking SSL status for domain: ${domain}`);
    
    const sslInfo = await sslService.checkSSLStatus(domain);
    console.log(`SSL status result for ${domain}:`, sslInfo);

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
      domain: req.params.domain,
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

// Manual refresh endpoint for SSL data (forces fresh certificate check)
router.post('/refresh/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const sslService = require('../services/sslService');
    
    console.log(`Manual SSL data refresh requested for ${domain}`);
    
    // Force fresh SSL certificate check
    const freshSSLData = await sslService.checkSSLStatus(domain);
    
    // Emit updated data to connected clients
    req.io.emit('ssl_data_refreshed', {
      domain,
      ssl: freshSSLData
    });
    
    res.json({
      success: true,
      message: `SSL data refreshed for ${domain}`,
      domain,
      ssl: freshSSLData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error refreshing SSL data for ${req.params.domain}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh SSL data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
