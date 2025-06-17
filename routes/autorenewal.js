const express = require('express');
const router = express.Router();
const AutoRenewalService = require('../services/autoRenewalService');

// Initialize the autorenewal service
const autoRenewalService = new AutoRenewalService();
autoRenewalService.initialize();

// Get autorenewal status for all domains
router.get('/status', async (req, res) => {
  try {
    const status = await autoRenewalService.getRenewalStatus();
    
    res.json({
      success: true,
      ...status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting autorenewal status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get autorenewal status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Update global autorenewal settings
router.post('/settings', async (req, res) => {
  try {
    const { globalEnabled, renewalDays, checkFrequency } = req.body;
    const config = await autoRenewalService.getConfig();
    
    if (globalEnabled !== undefined) config.globalEnabled = globalEnabled;
    if (renewalDays !== undefined) config.renewalDays = parseInt(renewalDays);
    if (checkFrequency !== undefined) config.checkFrequency = checkFrequency;
    
    await autoRenewalService.saveConfig(config);
    await autoRenewalService.logActivity('GLOBAL', 'SETTINGS_UPDATED', 
      `Global: ${globalEnabled}, Days: ${renewalDays}, Frequency: ${checkFrequency}`);
    
    // Update cron job if needed
    if (config.globalEnabled) {
      await autoRenewalService.setupCronJob(config.checkFrequency);
    } else {
      await autoRenewalService.clearCronJob();
    }
    
    if (req.io) {
      req.io.emit('autorenewal_settings_updated', { config });
    }
    
    res.json({
      success: true,
      message: 'Autorenewal settings updated',
      config: {
        globalEnabled: config.globalEnabled,
        renewalDays: config.renewalDays,
        checkFrequency: config.checkFrequency
      }
    });
  } catch (error) {
    console.error('Error updating autorenewal settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings',
      message: error.message
    });
  }
});

// Toggle autorenewal for specific domain
router.post('/toggle/:domain', async (req, res) => {
  try {
    const domain = req.params.domain;
    const { enabled } = req.body;
    
    const config = await autoRenewalService.getConfig();
    
    if (!config.domains[domain]) {
      config.domains[domain] = {};
    }
    
    config.domains[domain].enabled = enabled;
    config.domains[domain].lastModified = new Date().toISOString();
    
    await autoRenewalService.saveConfig(config);
    await autoRenewalService.logActivity(domain, enabled ? 'ENABLED' : 'DISABLED', 
      `Autorenewal ${enabled ? 'enabled' : 'disabled'} for domain`);
    
    if (req.io) {
      req.io.emit('autorenewal_domain_toggled', { domain, enabled });
    }
    
    res.json({
      success: true,
      message: `Autorenewal ${enabled ? 'enabled' : 'disabled'} for ${domain}`,
      domain,
      enabled
    });
  } catch (error) {
    console.error('Error toggling autorenewal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle autorenewal',
      message: error.message
    });
  }
});

// Force renewal check for all domains (Run Check Now button)
router.post('/check', async (req, res) => {
  try {
    console.log('Starting manual renewal check...');
    
    if (req.io) {
      req.io.emit('autorenewal_check_started', { 
        type: 'manual',
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await autoRenewalService.performRenewalCheck(req.io);
    
    if (req.io) {
      req.io.emit('autorenewal_check_completed', result);
    }
    
    res.json({
      success: true,
      message: 'Renewal check completed',
      result
    });
  } catch (error) {
    console.error('Error performing renewal check:', error);
    
    if (req.io) {
      req.io.emit('autorenewal_check_error', { error: error.message });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to perform renewal check',
      message: error.message
    });
  }
});

// Force renewal for specific domain
router.post('/renew/:domain', async (req, res) => {
  try {
    const domain = req.params.domain;
    
    console.log(`Starting manual renewal for domain: ${domain}`);
    
    if (req.io) {
      req.io.emit('autorenewal_domain_renewing', { domain });
    }
    
    const result = await autoRenewalService.renewDomainCertificate(domain, req.io);
    
    if (req.io) {
      req.io.emit('autorenewal_domain_renewed', { domain, result });
    }
    
    res.json({
      success: true,
      message: `SSL certificate renewal initiated for ${domain}`,
      domain,
      result
    });
  } catch (error) {
    console.error('Error renewing domain certificate:', error);
    
    if (req.io) {
      req.io.emit('autorenewal_domain_error', { domain: req.params.domain, error: error.message });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to renew certificate',
      message: error.message
    });
  }
});

// Get recent activity log
router.get('/activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const activities = await autoRenewalService.getActivityLogs(limit);
    
    res.json({
      success: true,
      activities,
      total: activities.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting activity log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity log',
      message: error.message
    });
  }
});

// Clear activity log
router.post('/clear-log', async (req, res) => {
  try {
    const fs = require('fs').promises;
    await fs.writeFile(autoRenewalService.logFile, '');
    
    await autoRenewalService.logActivity('SYSTEM', 'LOG_CLEARED', 'Activity log cleared manually');
    
    res.json({
      success: true,
      message: 'Activity log cleared'
    });
  } catch (error) {
    console.error('Error clearing activity log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear activity log',
      message: error.message
    });
  }
});

// Get cron status
router.get('/cron-status', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      const { stdout } = await execAsync('crontab -l 2>/dev/null || echo ""');
      const cronLines = stdout.trim().split('\n').filter(line => 
        line.includes('autorenewal-cron.sh') && !line.startsWith('#')
      );
      
      const hasCron = cronLines.length > 0;
      const cronExpression = hasCron ? cronLines[0].split(' ').slice(0, 5).join(' ') : null;
      
      res.json({
        success: true,
        hasCron,
        cronExpression,
        cronLines,
        timestamp: new Date().toISOString()
      });
    } catch (cronError) {
      res.json({
        success: true,
        hasCron: false,
        error: 'Crontab not accessible',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error checking cron status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check cron status',
      message: error.message
    });
  }
});

// Manual cron setup
router.post('/setup-cron', async (req, res) => {
  try {
    const { frequency } = req.body;
    const config = await autoRenewalService.getConfig();
    
    if (frequency) {
      config.checkFrequency = frequency;
      await autoRenewalService.saveConfig(config);
    }
    
    const result = await autoRenewalService.setupCronJob(config.checkFrequency);
    
    res.json({
      success: result,
      message: result ? 'Cron job setup successfully' : 'Failed to setup cron job',
      frequency: config.checkFrequency
    });
  } catch (error) {
    console.error('Error setting up cron:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to setup cron job',
      message: error.message
    });
  }
});

module.exports = router;