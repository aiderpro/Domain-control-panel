const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const certbotService = require('./certbotService');
const sslService = require('./sslService');
const nginxService = require('./nginxService');

const execAsync = promisify(exec);

class AutoRenewalService {
  constructor() {
    this.configDir = path.join(__dirname, '..', 'data');
    this.configFile = path.join(this.configDir, 'autorenewal.json');
    this.logFile = path.join(this.configDir, 'autorenewal.log');
    this.lockFile = path.join(this.configDir, 'autorenewal.lock');
    this.cronJob = null;
    this.isRunning = false;
    this.lastCheck = null;
    this.renewalInProgress = new Set(); // Track domains being renewed
  }

  /**
   * Initialize autorenewal service and setup cron if needed
   */
  async initialize() {
    await this.ensureConfigDir();
    const config = await this.getConfig();
    
    if (config.globalEnabled) {
      await this.setupCronJob(config.checkFrequency);
    }
    
    console.log('AutoRenewal service initialized');
  }

  /**
   * Ensure config directory exists
   */
  async ensureConfigDir() {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
    } catch (error) {
      console.error('Error creating config directory:', error);
    }
  }

  /**
   * Get autorenewal configuration
   */
  async getConfig() {
    try {
      const configData = await fs.readFile(this.configFile, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      const defaultConfig = {
        globalEnabled: true,
        renewalDays: 30,
        checkFrequency: 'daily',
        lastGlobalCheck: null,
        domains: {},
        statistics: {
          totalChecks: 0,
          totalRenewals: 0,
          successfulRenewals: 0,
          failedRenewals: 0,
          lastRenewalDate: null,
          lastCheckDate: null
        },
        renewalSchedule: {
          minHoursBetweenChecks: 12, // Prevent too frequent checks
          maxConcurrentRenewals: 3,  // Limit concurrent renewals
          retryFailedAfterHours: 24  // Retry failed renewals after 24 hours
        }
      };
      await this.saveConfig(defaultConfig);
      return defaultConfig;
    }
  }

  /**
   * Save autorenewal configuration
   */
  async saveConfig(config) {
    await this.ensureConfigDir();
    await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
  }

  /**
   * Log autorenewal activity with detailed information
   */
  async logActivity(domain, status, message, details = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      domain,
      status,
      message,
      details
    };
    
    const logLine = `${timestamp} | ${domain} | ${status} | ${message}${details ? ' | ' + JSON.stringify(details) : ''}\n`;
    
    try {
      await this.ensureConfigDir();
      await fs.appendFile(this.logFile, logLine);
      console.log(`AutoRenewal Log: ${domain} - ${status} - ${message}`);
    } catch (error) {
      console.error('Failed to log autorenewal activity:', error);
    }
  }

  /**
   * Check if renewal is currently locked (prevent concurrent runs)
   */
  async isLocked() {
    try {
      const lockData = await fs.readFile(this.lockFile, 'utf8');
      const lock = JSON.parse(lockData);
      
      // Check if lock is stale (older than 2 hours)
      const lockAge = Date.now() - new Date(lock.timestamp).getTime();
      if (lockAge > 2 * 60 * 60 * 1000) {
        await this.releaseLock();
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Acquire renewal lock
   */
  async acquireLock() {
    const lockData = {
      timestamp: new Date().toISOString(),
      pid: process.pid
    };
    await fs.writeFile(this.lockFile, JSON.stringify(lockData, null, 2));
  }

  /**
   * Release renewal lock
   */
  async releaseLock() {
    try {
      await fs.unlink(this.lockFile);
    } catch (error) {
      // Lock file doesn't exist, ignore
    }
  }

  /**
   * Perform comprehensive renewal check for all eligible domains
   */
  async performRenewalCheck(io = null) {
    if (await this.isLocked()) {
      const message = 'Renewal check already in progress, skipping';
      console.log(message);
      return { success: false, message, skipped: true };
    }

    try {
      await this.acquireLock();
      this.isRunning = true;
      this.lastCheck = new Date().toISOString();

      if (io) {
        io.emit('autorenewal_check_started', { timestamp: this.lastCheck });
      }

      await this.logActivity('SYSTEM', 'CHECK_STARTED', 'Starting comprehensive renewal check');

      const config = await this.getConfig();
      const domains = await nginxService.scanDomains();
      
      // Filter domains that need renewal checking
      const eligibleDomains = [];
      const skippedDomains = [];
      const results = {
        checked: 0,
        eligible: 0,
        renewed: 0,
        failed: 0,
        skipped: 0,
        details: []
      };

      // Check each domain for renewal eligibility
      for (const domain of domains) {
        try {
          const domainConfig = config.domains[domain.domain] || { enabled: false };
          
          // Skip if autorenewal disabled for this domain
          if (!domainConfig.enabled) {
            skippedDomains.push({ domain: domain.domain, reason: 'Autorenewal disabled' });
            results.skipped++;
            continue;
          }

          // Skip if already being renewed
          if (this.renewalInProgress.has(domain.domain)) {
            skippedDomains.push({ domain: domain.domain, reason: 'Renewal in progress' });
            results.skipped++;
            continue;
          }

          // Check SSL status
          const sslInfo = await sslService.checkSSLStatus(domain.domain);
          results.checked++;

          if (!sslInfo || !sslInfo.hasSSL) {
            skippedDomains.push({ domain: domain.domain, reason: 'No SSL certificate found' });
            results.skipped++;
            continue;
          }

          // Check if renewal is needed (within renewal window)
          const daysUntilExpiry = sslInfo.daysUntilExpiry || 0;
          if (daysUntilExpiry > config.renewalDays) {
            skippedDomains.push({ 
              domain: domain.domain, 
              reason: `Certificate expires in ${daysUntilExpiry} days (renewal threshold: ${config.renewalDays} days)` 
            });
            results.skipped++;
            continue;
          }

          // Check if recently failed and retry period hasn't passed
          if (domainConfig.lastFailure) {
            const failureAge = Date.now() - new Date(domainConfig.lastFailure).getTime();
            const retryThreshold = config.renewalSchedule.retryFailedAfterHours * 60 * 60 * 1000;
            
            if (failureAge < retryThreshold) {
              skippedDomains.push({ 
                domain: domain.domain, 
                reason: `Recent failure, retry in ${Math.ceil((retryThreshold - failureAge) / (60 * 60 * 1000))} hours` 
              });
              results.skipped++;
              continue;
            }
          }

          eligibleDomains.push({
            domain: domain.domain,
            daysUntilExpiry,
            sslInfo,
            domainConfig
          });
          results.eligible++;

        } catch (error) {
          console.error(`Error checking domain ${domain.domain}:`, error);
          results.failed++;
          results.details.push({
            domain: domain.domain,
            action: 'check',
            success: false,
            error: error.message
          });
        }
      }

      // Sort eligible domains by urgency (expiring soonest first)
      eligibleDomains.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

      await this.logActivity('SYSTEM', 'CHECK_ANALYSIS', 
        `Found ${results.eligible} domains eligible for renewal out of ${results.checked} checked domains`);

      if (io) {
        io.emit('autorenewal_check_analysis', {
          eligible: results.eligible,
          checked: results.checked,
          skipped: results.skipped
        });
      }

      // Process renewals with concurrency limit
      const maxConcurrent = config.renewalSchedule.maxConcurrentRenewals;
      const renewalPromises = [];

      for (let i = 0; i < eligibleDomains.length; i += maxConcurrent) {
        const batch = eligibleDomains.slice(i, i + maxConcurrent);
        
        const batchPromises = batch.map(async (domainInfo) => {
          return await this.renewDomainCertificate(domainInfo.domain, io);
        });

        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          const domain = batch[index].domain;
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              results.renewed++;
              results.details.push({
                domain,
                action: 'renew',
                success: true,
                message: result.value.message
              });
            } else {
              results.failed++;
              results.details.push({
                domain,
                action: 'renew',
                success: false,
                error: result.value.error
              });
            }
          } else {
            results.failed++;
            results.details.push({
              domain,
              action: 'renew',
              success: false,
              error: result.reason.message
            });
          }
        });

        // Small delay between batches to prevent overwhelming the system
        if (i + maxConcurrent < eligibleDomains.length) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      // Update statistics
      config.statistics.totalChecks++;
      config.statistics.totalRenewals += results.renewed;
      config.statistics.successfulRenewals += results.renewed;
      config.statistics.failedRenewals += results.failed;
      config.statistics.lastCheckDate = this.lastCheck;
      if (results.renewed > 0) {
        config.statistics.lastRenewalDate = this.lastCheck;
      }
      config.lastGlobalCheck = this.lastCheck;

      await this.saveConfig(config);

      const summary = `Renewal check completed: ${results.renewed} renewed, ${results.failed} failed, ${results.skipped} skipped`;
      await this.logActivity('SYSTEM', 'CHECK_COMPLETED', summary, results);

      if (io) {
        io.emit('autorenewal_check_completed', {
          success: true,
          results,
          timestamp: this.lastCheck
        });
      }

      return {
        success: true,
        message: summary,
        results,
        timestamp: this.lastCheck
      };

    } catch (error) {
      console.error('Error during renewal check:', error);
      await this.logActivity('SYSTEM', 'CHECK_ERROR', error.message);
      
      if (io) {
        io.emit('autorenewal_check_error', { error: error.message });
      }
      
      throw error;
    } finally {
      await this.releaseLock();
      this.isRunning = false;
    }
  }

  /**
   * Renew SSL certificate for specific domain
   */
  async renewDomainCertificate(domain, io = null) {
    if (this.renewalInProgress.has(domain)) {
      return { success: false, error: 'Renewal already in progress for this domain' };
    }

    this.renewalInProgress.add(domain);

    try {
      await this.logActivity(domain, 'RENEWAL_STARTED', 'Starting SSL certificate renewal');

      if (io) {
        io.emit('autorenewal_domain_started', { domain });
      }

      // Wait for certbot availability to prevent conflicts
      await certbotService.waitForCertbotAvailability(domain, io);

      // Perform the renewal
      const result = await certbotService.renewCertificate(domain, io);

      const config = await this.getConfig();
      
      if (result.success) {
        // Update domain config on successful renewal
        if (!config.domains[domain]) {
          config.domains[domain] = { enabled: true };
        }
        
        config.domains[domain].lastRenewal = new Date().toISOString();
        config.domains[domain].lastSuccess = new Date().toISOString();
        config.domains[domain].status = 'active';
        delete config.domains[domain].lastFailure; // Clear any previous failure

        // Clear SSL cache to get fresh data
        sslService.clearSSLCache(domain);

        await this.saveConfig(config);
        await this.logActivity(domain, 'RENEWAL_SUCCESS', 'SSL certificate renewed successfully');

        if (io) {
          io.emit('autorenewal_domain_success', { domain, result });
        }

        return { success: true, message: 'Certificate renewed successfully', result };

      } else {
        // Update domain config on failure
        if (!config.domains[domain]) {
          config.domains[domain] = { enabled: true };
        }
        
        config.domains[domain].lastFailure = new Date().toISOString();
        config.domains[domain].status = 'failed';
        config.domains[domain].lastError = result.error || 'Unknown error';

        await this.saveConfig(config);
        await this.logActivity(domain, 'RENEWAL_FAILED', result.error || 'Unknown error');

        if (io) {
          io.emit('autorenewal_domain_failed', { domain, error: result.error });
        }

        return { success: false, error: result.error || 'Renewal failed' };
      }

    } catch (error) {
      console.error(`Error renewing certificate for ${domain}:`, error);
      
      const config = await this.getConfig();
      if (!config.domains[domain]) {
        config.domains[domain] = { enabled: true };
      }
      
      config.domains[domain].lastFailure = new Date().toISOString();
      config.domains[domain].status = 'error';
      config.domains[domain].lastError = error.message;

      await this.saveConfig(config);
      await this.logActivity(domain, 'RENEWAL_ERROR', error.message);

      if (io) {
        io.emit('autorenewal_domain_error', { domain, error: error.message });
      }

      return { success: false, error: error.message };

    } finally {
      this.renewalInProgress.delete(domain);
    }
  }

  /**
   * Setup automatic renewal checking (Node.js based for Replit environment)
   */
  async setupCronJob(frequency) {
    try {
      // Clear existing interval
      if (this.cronJob) {
        clearInterval(this.cronJob);
        this.cronJob = null;
      }

      let intervalMs;
      switch (frequency) {
        case 'hourly':
          intervalMs = 60 * 60 * 1000; // Every hour
          break;
        case 'twice-daily':
          intervalMs = 12 * 60 * 60 * 1000; // Every 12 hours
          break;
        case 'daily':
          intervalMs = 24 * 60 * 60 * 1000; // Every 24 hours
          break;
        case 'weekly':
          intervalMs = 7 * 24 * 60 * 60 * 1000; // Every 7 days
          break;
        default:
          intervalMs = 24 * 60 * 60 * 1000; // Default to daily
      }

      // Setup Node.js interval for automatic checking
      this.cronJob = setInterval(async () => {
        try {
          console.log('Running scheduled SSL renewal check...');
          await this.performRenewalCheck();
        } catch (error) {
          console.error('Scheduled renewal check failed:', error);
          await this.logActivity('SYSTEM', 'SCHEDULED_CHECK_ERROR', error.message);
        }
      }, intervalMs);

      await this.logActivity('SYSTEM', 'SCHEDULER_SETUP', `Automatic renewal scheduler configured for ${frequency} checks`);
      console.log(`AutoRenewal scheduler setup: ${frequency} (every ${intervalMs / 1000 / 60} minutes)`);

      return true;
    } catch (error) {
      console.error('Error setting up renewal scheduler:', error);
      await this.logActivity('SYSTEM', 'SCHEDULER_ERROR', error.message);
      return false;
    }
  }

  /**
   * Create the cron script file
   */
  async createCronScript(scriptPath) {
    const scriptDir = path.dirname(scriptPath);
    await fs.mkdir(scriptDir, { recursive: true });

    const scriptContent = `#!/bin/bash
# AutoRenewal Cron Script
# Generated automatically by SSL Certificate Manager

cd "${path.join(__dirname, '..')}"
/usr/bin/node -e "
const autoRenewalService = require('./services/autoRenewalService');
const service = new autoRenewalService();
service.performRenewalCheck().then(result => {
  console.log('Cron renewal check completed:', result.message);
}).catch(error => {
  console.error('Cron renewal check failed:', error.message);
});
"
`;

    await fs.writeFile(scriptPath, scriptContent);
    await execAsync(`chmod +x "${scriptPath}"`);
  }

  /**
   * Clear existing cron job
   */
  async clearCronJob() {
    try {
      if (this.cronJob) {
        clearInterval(this.cronJob);
        this.cronJob = null;
        await this.logActivity('SYSTEM', 'SCHEDULER_CLEARED', 'Automatic renewal scheduler stopped');
        console.log('AutoRenewal scheduler cleared');
      }
      return true;
    } catch (error) {
      console.error('Error clearing renewal scheduler:', error);
      await this.logActivity('SYSTEM', 'SCHEDULER_CLEAR_ERROR', error.message);
      return false;
    }
  }

  /**
   * Get recent activity logs
   */
  async getActivityLogs(limit = 100) {
    try {
      const logData = await fs.readFile(this.logFile, 'utf8');
      const logLines = logData.trim().split('\n').filter(line => line.length > 0);
      const recentLines = logLines.slice(-limit).reverse();

      return recentLines.map(line => {
        const parts = line.split(' | ');
        if (parts.length >= 4) {
          return {
            timestamp: parts[0],
            domain: parts[1],
            status: parts[2],
            message: parts[3],
            details: parts[4] ? JSON.parse(parts[4]) : null
          };
        }
        return { raw: line };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Get renewal status for all domains
   */
  async getRenewalStatus() {
    const config = await this.getConfig();
    const domains = await nginxService.scanDomains();

    const domainStatuses = await Promise.all(domains.map(async (domain) => {
      const domainConfig = config.domains[domain.domain] || { enabled: false };
      
      let sslInfo = null;
      try {
        sslInfo = await sslService.checkSSLStatus(domain.domain);
      } catch (error) {
        // SSL check failed
      }

      return {
        domain: domain.domain,
        enabled: domainConfig.enabled,
        hasSSL: sslInfo?.hasSSL || false,
        daysUntilExpiry: sslInfo?.daysUntilExpiry || 0,
        isExpired: sslInfo?.isExpired || false,
        isExpiringSoon: sslInfo?.isExpiringSoon || false,
        lastRenewal: domainConfig.lastRenewal,
        lastSuccess: domainConfig.lastSuccess,
        lastFailure: domainConfig.lastFailure,
        lastError: domainConfig.lastError,
        status: domainConfig.status || 'unknown',
        renewalNeeded: sslInfo?.hasSSL && (sslInfo.daysUntilExpiry <= config.renewalDays),
        inProgress: this.renewalInProgress.has(domain.domain)
      };
    }));

    return {
      globalConfig: {
        globalEnabled: config.globalEnabled,
        renewalDays: config.renewalDays,
        checkFrequency: config.checkFrequency,
        lastGlobalCheck: config.lastGlobalCheck
      },
      statistics: config.statistics,
      domains: domainStatuses,
      systemStatus: {
        isRunning: this.isRunning,
        lastCheck: this.lastCheck,
        activeRenewals: Array.from(this.renewalInProgress)
      }
    };
  }
}

module.exports = AutoRenewalService;