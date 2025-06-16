const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const { exec } = require('child_process');
const path = require('path');
const nginxService = require('../services/nginxService');
const sslService = require('../services/sslService');

// Autorenewal configuration file - use local directory for development
const CONFIG_DIR = path.join(__dirname, '..', 'data');
const AUTORENEWAL_CONFIG_FILE = path.join(CONFIG_DIR, 'autorenewal.json');
const AUTORENEWAL_LOG_FILE = path.join(CONFIG_DIR, 'autorenewal.log');

// Ensure autorenewal directory exists
async function ensureAutorenewalDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating config directory:', error);
  }
}

// Get autorenewal configuration
async function getAutorenewalConfig() {
  try {
    await ensureAutorenewalDir();
    const configData = await fs.readFile(AUTORENEWAL_CONFIG_FILE, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    // Return default configuration
    const defaultConfig = {
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
    await saveAutorenewalConfig(defaultConfig);
    return defaultConfig;
  }
}

// Save autorenewal configuration
async function saveAutorenewalConfig(config) {
  await ensureAutorenewalDir();
  await fs.writeFile(AUTORENEWAL_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Log autorenewal activity
async function logActivity(domain, status, message) {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp} - ${domain}: ${status} - ${message}\n`;
  
  try {
    await ensureAutorenewalDir();
    await fs.appendFile(AUTORENEWAL_LOG_FILE, logEntry);
  } catch (error) {
    console.error('Failed to log autorenewal activity:', error);
  }
}

// Get autorenewal status for all domains
router.get('/status', async (req, res) => {
  try {
    const config = await getAutorenewalConfig();
    const domains = await nginxService.scanDomains();
    
    // Enhance domains with autorenewal status
    const domainsWithRenewal = await Promise.all(domains.map(async (domain) => {
      const domainConfig = config.domains[domain.domain] || {
        enabled: domain.ssl?.hasSSL || false,
        lastRenewal: null,
        nextCheck: null,
        status: 'active'
      };
      
      // Get SSL info
      let sslInfo = domain.ssl;
      if (domain.hasSSLConfig) {
        try {
          sslInfo = await sslService.checkSSLStatus(domain.domain);
        } catch (error) {
          // Use existing SSL info from domain scan
        }
      }
      
      // Calculate next check date
      let nextCheck = null;
      if (domainConfig.enabled && sslInfo?.hasSSL) {
        const now = new Date();
        switch (config.checkFrequency) {
          case 'hourly':
            nextCheck = new Date(now.getTime() + 60 * 60 * 1000);
            break;
          case 'daily':
            nextCheck = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            break;
          case 'weekly':
            nextCheck = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            break;
        }
      }
      
      return {
        ...domain,
        ssl: sslInfo,
        autorenewal: {
          ...domainConfig,
          nextCheck: nextCheck?.toISOString(),
          needsRenewal: sslInfo?.hasSSL && sslInfo?.daysRemaining <= config.renewalDays
        }
      };
    }));
    
    // Calculate statistics
    const stats = {
      totalDomains: domains.length,
      domainsWithSSL: domainsWithRenewal.filter(d => d.ssl?.hasSSL).length,
      autorenewalEnabled: domainsWithRenewal.filter(d => d.autorenewal.enabled).length,
      needingRenewal: domainsWithRenewal.filter(d => d.autorenewal.needsRenewal).length,
      nextRenewal: domainsWithRenewal
        .filter(d => d.autorenewal.enabled && d.ssl?.hasSSL)
        .sort((a, b) => (a.ssl?.daysRemaining || 999) - (b.ssl?.daysRemaining || 999))[0]
    };
    
    res.json({
      success: true,
      config: {
        globalEnabled: config.globalEnabled,
        renewalDays: config.renewalDays,
        checkFrequency: config.checkFrequency,
        lastCheck: config.lastCheck
      },
      domains: domainsWithRenewal,
      statistics: {
        ...config.statistics,
        ...stats
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting autorenewal status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get autorenewal status',
      message: error.message
    });
  }
});

// Update global autorenewal settings
router.post('/settings', async (req, res) => {
  try {
    const { globalEnabled, renewalDays, checkFrequency } = req.body;
    const config = await getAutorenewalConfig();
    
    if (globalEnabled !== undefined) config.globalEnabled = globalEnabled;
    if (renewalDays !== undefined) config.renewalDays = parseInt(renewalDays);
    if (checkFrequency !== undefined) config.checkFrequency = checkFrequency;
    
    await saveAutorenewalConfig(config);
    await logActivity('GLOBAL', 'SETTINGS_UPDATED', `Global: ${globalEnabled}, Days: ${renewalDays}, Frequency: ${checkFrequency}`);
    
    // Update cron job if needed
    await setupCronJob(config.checkFrequency);
    
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
    const config = await getAutorenewalConfig();
    
    if (!config.domains[domain]) {
      config.domains[domain] = {
        enabled: false,
        lastRenewal: null,
        nextCheck: null,
        status: 'inactive'
      };
    }
    
    config.domains[domain].enabled = enabled;
    config.domains[domain].status = enabled ? 'active' : 'disabled';
    
    await saveAutorenewalConfig(config);
    await logActivity(domain, enabled ? 'ENABLED' : 'DISABLED', `Autorenewal ${enabled ? 'enabled' : 'disabled'} for domain`);
    
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

// Force renewal check for all domains
router.post('/check', async (req, res) => {
  try {
    if (req.io) {
      req.io.emit('autorenewal_check_started');
    }
    
    const result = await performRenewalCheck();
    
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
    
    if (req.io) {
      req.io.emit('autorenewal_domain_renewing', { domain });
    }
    
    const result = await renewDomainCertificate(domain);
    
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
      req.io.emit('autorenewal_domain_error', { domain, error: error.message });
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
    
    try {
      const logData = await fs.readFile(AUTORENEWAL_LOG_FILE, 'utf8');
      const logLines = logData.trim().split('\n').filter(line => line.length > 0);
      const recentLines = logLines.slice(-limit).reverse();
      
      const activities = recentLines.map(line => {
        const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) - ([^:]+): ([^-]+) - (.+)$/);
        if (match) {
          return {
            timestamp: match[1],
            domain: match[2],
            status: match[3].trim(),
            message: match[4].trim()
          };
        }
        return null;
      }).filter(Boolean);
      
      res.json({
        success: true,
        activities,
        total: activities.length
      });
    } catch (error) {
      // Log file doesn't exist yet
      res.json({
        success: true,
        activities: [],
        total: 0
      });
    }
  } catch (error) {
    console.error('Error getting activity log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity log',
      message: error.message
    });
  }
});

// Perform renewal check for all domains
async function performRenewalCheck() {
  console.log('Starting autorenewal check...');
  const config = await getAutorenewalConfig();
  
  if (!config.globalEnabled) {
    await logActivity('GLOBAL', 'SKIPPED', 'Global autorenewal is disabled');
    return { message: 'Global autorenewal is disabled', checked: 0, renewed: 0 };
  }
  
  const domains = await nginxService.scanDomains();
  let checked = 0;
  let renewed = 0;
  let errors = 0;
  
  for (const domain of domains) {
    const domainName = domain.domain;
    const domainConfig = config.domains[domainName];
    
    if (!domainConfig?.enabled || !domain.ssl?.hasSSL) {
      continue;
    }
    
    checked++;
    
    try {
      // Check if renewal is needed
      const sslStatus = await sslService.checkSSLStatus(domainName);
      
      if (sslStatus.hasSSL && sslStatus.daysRemaining <= config.renewalDays) {
        console.log(`Domain ${domainName} needs renewal (${sslStatus.daysRemaining} days remaining)`);
        
        const renewalResult = await renewDomainCertificate(domainName);
        if (renewalResult.success) {
          renewed++;
          config.domains[domainName].lastRenewal = new Date().toISOString();
          config.domains[domainName].status = 'renewed';
          config.statistics.successfulRenewals++;
        } else {
          errors++;
          config.domains[domainName].status = 'error';
          config.statistics.failedRenewals++;
        }
      } else {
        await logActivity(domainName, 'CHECKED', `Certificate valid for ${sslStatus.daysRemaining} more days`);
        config.domains[domainName].status = 'active';
      }
    } catch (error) {
      console.error(`Error checking domain ${domainName}:`, error);
      await logActivity(domainName, 'ERROR', `Check failed: ${error.message}`);
      errors++;
    }
  }
  
  // Update configuration
  config.lastCheck = new Date().toISOString();
  config.statistics.totalRenewals += renewed;
  if (renewed > 0) {
    config.statistics.lastRenewalDate = new Date().toISOString();
  }
  
  await saveAutorenewalConfig(config);
  
  const result = { checked, renewed, errors };
  await logActivity('GLOBAL', 'CHECK_COMPLETED', `Checked: ${checked}, Renewed: ${renewed}, Errors: ${errors}`);
  
  return result;
}

// Renew certificate for specific domain
async function renewDomainCertificate(domain) {
  return new Promise((resolve) => {
    console.log(`Starting SSL renewal for domain: ${domain}`);
    
    exec(`certbot renew --cert-name ${domain} --nginx --non-interactive --quiet`, async (error, stdout, stderr) => {
      if (error) {
        const errorMsg = `Renewal failed: ${stderr}`;
        console.error(`SSL renewal failed for ${domain}:`, errorMsg);
        await logActivity(domain, 'RENEWAL_FAILED', errorMsg);
        resolve({ success: false, error: errorMsg });
      } else {
        const successMsg = 'Certificate renewed successfully';
        console.log(`SSL renewal successful for ${domain}`);
        await logActivity(domain, 'RENEWAL_SUCCESS', successMsg);
        resolve({ success: true, message: successMsg });
      }
    });
  });
}

// Setup cron job for automatic renewal checks
async function setupCronJob(frequency) {
  let cronExpression;
  
  switch (frequency) {
    case 'hourly':
      cronExpression = '0 * * * *'; // Every hour
      break;
    case 'daily':
      cronExpression = '0 2 * * *'; // Daily at 2 AM
      break;
    case 'weekly':
      cronExpression = '0 2 * * 0'; // Weekly on Sunday at 2 AM
      break;
    default:
      cronExpression = '0 2 * * *'; // Default to daily
  }
  
  const cronJob = `${cronExpression} cd /var/www/nginx-control-panel && node -e "
const autorenewal = require('./routes/autorenewal.js');
const path = require('path');
const { performRenewalCheck } = require('./routes/autorenewal.js');
performRenewalCheck().catch(console.error);
" >> /var/log/ssl-autorenewal.log 2>&1`;
  
  // This would typically use a cron library or system cron
  console.log('Cron job configuration:', cronJob);
}

module.exports = router;