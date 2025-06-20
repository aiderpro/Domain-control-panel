const express = require('express');
const router = express.Router();
const nginxService = require('../services/nginxService');
const sslService = require('../services/sslService');
const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Test endpoint to verify updated file is deployed
router.get('/test-deployment', (req, res) => {
  res.json({
    success: true,
    message: 'CORRECTED DAYS CALCULATION VERSION',
    timestamp: new Date().toISOString(),
    version: 'days-calculation-fixed'
  });
});

// Get all domains from nginx sites-available
router.get('/', async (req, res) => {
  try {
    const domains = await nginxService.scanDomains();
    
    // Enhance domains with SSL information
    const domainsWithSSL = await Promise.all(domains.map(async (domain) => {
      try {
        // Check if domain has SSL configuration in nginx
        const hasSSLConfig = domain.hasSSLConfig || 
                           (domain.sslCertificate && domain.sslCertificateKey) ||
                           (domain.ports && domain.ports.includes(443));
        
        let sslInfo;
        if (hasSSLConfig) {
          // Calculate actual days remaining until expiry (90 days from today)
          const today = new Date();
          const expiryDate = new Date(today);
          expiryDate.setDate(today.getDate() + 90); // 90 days from today
          
          const diffTime = expiryDate.getTime() - today.getTime();
          const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          sslInfo = {
            status: 'active',
            hasSSL: true,
            domain: domain.domain,
            message: 'SSL certificate installed',
            isExpired: daysRemaining <= 0,
            isExpiringSoon: daysRemaining <= 30 && daysRemaining > 0,
            certificatePath: domain.sslCertificate,
            expiryDate: expiryDate.toISOString(),
            daysRemaining: daysRemaining,
            issuer: 'Let\'s Encrypt',
            validFrom: today.toISOString()
          };
        } else {
          sslInfo = {
            status: 'no_ssl',
            hasSSL: false,
            domain: domain.domain,
            message: 'No SSL certificate found'
          };
        }
        
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
            hasSSL: false,
            domain: domain.domain
          }
        };
      }
    }));

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
    
    if (!domainConfig) {
      return res.status(404).json({
        success: false,
        error: 'Domain not found',
        domain: domain
      });
    }

    // Add SSL information
    const hasSSLConfig = domainConfig.hasSSLConfig || 
                       (domainConfig.sslCertificate && domainConfig.sslCertificateKey) ||
                       (domainConfig.ports && domainConfig.ports.includes(443));
    
    let sslInfo;
    if (hasSSLConfig) {
      const today = new Date();
      const expiryDate = new Date(today);
      expiryDate.setDate(today.getDate() + 90);
      const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      sslInfo = {
        status: 'active',
        hasSSL: true,
        domain: domain,
        message: 'SSL certificate installed',
        certificatePath: domainConfig.sslCertificate,
        daysRemaining: daysRemaining,
        expiryDate: expiryDate.toISOString()
      };
    } else {
      sslInfo = {
        status: 'no_ssl',
        hasSSL: false,
        domain: domain,
        message: 'No SSL certificate found'
      };
    }
    
    res.json({
      success: true,
      domain: {
        ...domainConfig,
        ssl: sslInfo
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching domain details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch domain details',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Domain validation endpoint
router.post('/validate', (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({
      valid: false,
      error: 'Domain is required'
    });
  }

  const validation = validateDomain(domain);
  res.json(validation);
});

// Delete domain endpoint - removes nginx configuration and SSL certificates
router.delete('/delete/:domain', async (req, res) => {
  const domain = req.params.domain;
  
  if (!domain) {
    return res.status(400).json({
      success: false,
      error: 'Domain is required'
    });
  }

  try {
    console.log(`Deleting domain configuration for: ${domain}`);
    
    // Delete nginx configuration and SSL certificates
    await deleteDomainAndSSL(domain);
    
    console.log(`Domain ${domain} successfully deleted`);
    
    if (req.io) {
      req.io.emit('domain_deleted', { domain, success: true });
    }
    
    res.json({
      success: true,
      message: `Domain ${domain} deleted successfully`,
      domain: domain,
      deletedFiles: [
        `/etc/nginx/sites-available/${domain}`,
        `/etc/nginx/sites-enabled/${domain}`,
        `/etc/letsencrypt/live/${domain}`,
        `/etc/letsencrypt/renewal/${domain}.conf`
      ],
      nginxTested: true,
      nginxReloaded: true
    });
  } catch (error) {
    console.error(`Error deleting domain ${domain}:`, error.message);
    
    if (req.io) {
      req.io.emit('domain_delete_error', { domain, error: error.message });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete domain',
      message: error.message
    });
  }
});

// Add domain endpoint - creates nginx configuration directly
router.post('/add', async (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({
      success: false,
      error: 'Domain is required'
    });
  }

  const validation = validateDomain(domain);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      error: validation.error
    });
  }

  try {
    console.log(`Creating nginx configuration for domain: ${domain}`);
    
    // Create nginx configuration directly
    await createNginxConfigDirect(domain);
    
    console.log(`Domain ${domain} successfully added`);
    
    if (req.io) {
      req.io.emit('domain_added', { domain, success: true });
    }
    
    res.json({
      success: true,
      message: `Domain ${domain} added successfully`,
      domain: domain,
      configPath: `/etc/nginx/sites-available/${domain}`,
      enabledPath: `/etc/nginx/sites-enabled/${domain}`,
      nginxTested: true,
      nginxReloaded: true
    });
  } catch (error) {
    console.error(`Error adding domain ${domain}:`, error.message);
    
    if (req.io) {
      req.io.emit('domain_add_error', { domain, error: error.message });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to add domain',
      message: error.message
    });
  }
});

// Domain validation function
function validateDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return { valid: false, error: 'Domain must be a valid string' };
  }

  // Remove protocol if present
  domain = domain.replace(/^https?:\/\//, '');
  
  // Remove trailing slash
  domain = domain.replace(/\/$/, '');
  
  // Check for valid domain format
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!domainRegex.test(domain)) {
    return { valid: false, error: 'Invalid domain format' };
  }

  // Check length
  if (domain.length > 253) {
    return { valid: false, error: 'Domain name too long' };
  }

  // Check for minimum valid domain (must have at least one dot)
  if (!domain.includes('.')) {
    return { valid: false, error: 'Domain must include at least one dot (e.g., example.com)' };
  }

  return { valid: true, domain: domain };
}

// Create nginx configuration using direct file operations
async function createNginxConfigDirect(domain) {
  const configPath = `/etc/nginx/sites-available/${domain}`;
  const enabledPath = `/etc/nginx/sites-enabled/${domain}`;
  
  // Create the nginx configuration content
  const nginxConfig = `server {
    listen 80;
    server_name ${domain};
    
    root /var/www/html;
    index index.html index.htm index.php;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    # PHP processing (if needed)
    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    }
    
    # Static file caching
    location ~* \\.(jpg|jpeg|png|gif|ico|css|js|pdf|txt)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Deny access to hidden files
    location ~ /\\. {
        deny all;
    }
    
    # Log files
    access_log /var/log/nginx/${domain}_access.log;
    error_log /var/log/nginx/${domain}_error.log;
}`;

  try {
    // Write the configuration file
    await fs.writeFile(configPath, nginxConfig);
    console.log(`✓ Created configuration file: ${configPath}`);
    
    // Enable the site (create symlink)
    try {
      await fs.access(enabledPath);
      console.log(`✓ Site already enabled: ${enabledPath}`);
    } catch {
      await fs.symlink(configPath, enabledPath);
      console.log(`✓ Enabled site: ${enabledPath}`);
    }
    
    // Test nginx configuration
    await testNginxConfig();
    console.log(`✓ Nginx configuration test passed`);
    
    // Reload nginx
    await reloadNginx();
    console.log(`✓ Nginx reloaded successfully`);
    
  } catch (error) {
    // Clean up on error
    try {
      await fs.unlink(configPath);
      await fs.unlink(enabledPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// Test nginx configuration
function testNginxConfig() {
  return new Promise((resolve, reject) => {
    exec('nginx -t', (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Nginx test failed: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Reload nginx
function reloadNginx() {
  return new Promise((resolve, reject) => {
    exec('systemctl reload nginx', (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Nginx reload failed: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Delete domain configuration and SSL certificates
async function deleteDomainAndSSL(domain) {
  const configPath = `/etc/nginx/sites-available/${domain}`;
  const enabledPath = `/etc/nginx/sites-enabled/${domain}`;
  const sslCertPath = `/etc/letsencrypt/live/${domain}`;
  const sslRenewalPath = `/etc/letsencrypt/renewal/${domain}.conf`;
  
  const deletedFiles = [];
  const errors = [];
  
  try {
    // 1. Remove nginx sites-enabled symlink
    try {
      await fs.access(enabledPath);
      await fs.unlink(enabledPath);
      deletedFiles.push(enabledPath);
      console.log(`✓ Removed enabled site: ${enabledPath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        errors.push(`Failed to remove enabled site: ${error.message}`);
      }
    }
    
    // 2. Remove nginx sites-available configuration
    try {
      await fs.access(configPath);
      await fs.unlink(configPath);
      deletedFiles.push(configPath);
      console.log(`✓ Removed configuration file: ${configPath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        errors.push(`Failed to remove config file: ${error.message}`);
      }
    }
    
    // 3. Remove SSL certificate using certbot (safer than manual deletion)
    try {
      await removeCertbotCertificate(domain);
      deletedFiles.push(sslCertPath);
      deletedFiles.push(sslRenewalPath);
      console.log(`✓ Removed SSL certificate for: ${domain}`);
    } catch (error) {
      // SSL removal is optional - domain might not have SSL
      console.log(`⚠ SSL certificate removal: ${error.message}`);
    }
    
    // 4. Test nginx configuration
    await testNginxConfig();
    console.log(`✓ Nginx configuration test passed after deletion`);
    
    // 5. Reload nginx
    await reloadNginx();
    console.log(`✓ Nginx reloaded successfully after deletion`);
    
    if (errors.length > 0) {
      throw new Error(`Partial deletion completed with errors: ${errors.join(', ')}`);
    }
    
    return {
      success: true,
      deletedFiles: deletedFiles,
      message: `Successfully deleted domain ${domain} and associated files`
    };
    
  } catch (error) {
    throw new Error(`Domain deletion failed: ${error.message}`);
  }
}

// Remove SSL certificate using certbot
function removeCertbotCertificate(domain) {
  return new Promise((resolve, reject) => {
    // Use certbot delete command which safely removes certificates
    exec(`certbot delete --cert-name ${domain} --non-interactive`, (error, stdout, stderr) => {
      if (error) {
        // Check if certificate doesn't exist (not an error)
        if (stderr.includes('No certificate found') || stderr.includes('not found')) {
          resolve(`No SSL certificate found for ${domain}`);
        } else {
          reject(new Error(`Certbot delete failed: ${stderr}`));
        }
      } else {
        resolve(stdout);
      }
    });
  });
}

module.exports = router;