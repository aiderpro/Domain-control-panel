const express = require('express');
const router = express.Router();
const nginxService = require('../services/nginxService');
const sslService = require('../services/sslService');

// Force refresh all SSL data for accurate statistics
router.post('/force-refresh', async (req, res) => {
  try {
    console.log('Force refreshing SSL data for accurate statistics...');
    
    // Clear all SSL cache
    sslService.clearAllSSLCache();
    
    // Get all domains
    const domains = await nginxService.scanDomains();
    console.log(`Found ${domains.length} domains for SSL refresh`);
    
    if (req.io) {
      req.io.emit('ssl_refresh_started', { 
        total: domains.length,
        message: 'Starting comprehensive SSL data refresh...'
      });
    }

    // Enhanced SSL checking with multiple detection methods
    const domainsWithSSL = [];
    const batchSize = 25;
    let processed = 0;
    
    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, i + batchSize);
      console.log(`Processing SSL refresh batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(domains.length/batchSize)}`);
      
      const batchResults = await Promise.all(
        batch.map(async (domain) => {
          try {
            // Method 1: Force refresh standard SSL check
            let sslInfo = await sslService.checkSSLStatus(domain.domain, true);
            
            // Method 2: Enhanced detection if not found
            if (!sslInfo || !sslInfo.hasSSL) {
              sslInfo = await sslService.checkMultipleCertPaths(domain.domain);
            }
            
            processed++;
            
            if (req.io && processed % 100 === 0) {
              req.io.emit('ssl_refresh_progress', { 
                processed,
                total: domains.length,
                percentage: Math.round((processed / domains.length) * 100)
              });
            }
            
            return {
              ...domain,
              ssl: sslInfo || { hasSSL: false }
            };
          } catch (error) {
            console.error(`Error refreshing SSL for ${domain.domain}:`, error.message);
            return {
              ...domain,
              ssl: { hasSSL: false, error: error.message }
            };
          }
        })
      );
      
      domainsWithSSL.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < domains.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Calculate accurate statistics
    const stats = {
      total: domainsWithSSL.length,
      withSSL: domainsWithSSL.filter(d => d.ssl && d.ssl.hasSSL).length,
      expiringSoon: domainsWithSSL.filter(d => d.ssl && d.ssl.hasSSL && d.ssl.daysUntilExpiry <= 30).length,
      expired: domainsWithSSL.filter(d => d.ssl && d.ssl.hasSSL && d.ssl.daysUntilExpiry <= 0).length,
      needsRenewal: domainsWithSSL.filter(d => d.ssl && d.ssl.hasSSL && d.ssl.daysUntilExpiry <= 30).length
    };

    console.log(`SSL refresh completed: ${stats.total} total, ${stats.withSSL} with SSL, ${stats.expiringSoon} expiring soon, ${stats.expired} expired`);
    
    if (req.io) {
      req.io.emit('ssl_refresh_completed', { 
        stats,
        message: `SSL refresh completed: ${stats.withSSL} certificates found`
      });
    }
    
    res.json({
      success: true,
      message: 'SSL data refreshed successfully',
      domains: domainsWithSSL,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error during SSL refresh:', error);
    
    if (req.io) {
      req.io.emit('ssl_refresh_error', { 
        error: error.message 
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to refresh SSL data',
      message: error.message
    });
  }
});

// Get current SSL statistics without full refresh
router.get('/stats', async (req, res) => {
  try {
    const domains = await nginxService.scanDomains();
    
    // Quick SSL check using cache
    const withSSL = [];
    const expiringSoon = [];
    const expired = [];
    
    for (const domain of domains) {
      try {
        const sslInfo = await sslService.checkSSLStatus(domain.domain, false); // Use cache
        if (sslInfo && sslInfo.hasSSL) {
          withSSL.push(domain);
          if (sslInfo.daysUntilExpiry <= 30) {
            expiringSoon.push(domain);
          }
          if (sslInfo.daysUntilExpiry <= 0) {
            expired.push(domain);
          }
        }
      } catch (error) {
        // Continue with other domains
      }
    }
    
    const stats = {
      total: domains.length,
      withSSL: withSSL.length,
      expiringSoon: expiringSoon.length,
      expired: expired.length
    };
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
      cached: true
    });

  } catch (error) {
    console.error('Error getting SSL stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get SSL statistics',
      message: error.message
    });
  }
});

module.exports = router;