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

// Simple domain validation function
function validateDomain(domain) {
  // Remove protocol if present
  domain = domain.replace(/^https?:\/\//, '');
  
  // Basic domain validation regex
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!domainRegex.test(domain)) {
    return { valid: false, error: 'Invalid domain format' };
  }
  
  if (domain.length > 253) {
    return { valid: false, error: 'Domain name too long' };
  }
  
  const parts = domain.split('.');
  if (parts.length < 2 || parts[parts.length - 1].length < 2) {
    return { valid: false, error: 'Invalid top-level domain' };
  }
  
  return { valid: true };
}

// Validate domain endpoint
router.post('/validate', (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({
      success: false,
      error: 'Domain is required'
    });
  }

  const validation = validateDomain(domain);
  res.json(validation);
});

// Add domain endpoint - creates actual nginx configuration
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
    
    const nginxConfig = await createNginxConfig(domain);
    
    if (req.io) {
      req.io.emit('domain_added', { domain, success: true });
    }
    
    res.json({
      success: true,
      message: `Domain ${domain} added successfully with nginx configuration`,
      domain: domain,
      configPath: `/etc/nginx/sites-available/${domain}`
    });
  } catch (error) {
    console.error('Error adding domain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add domain',
      message: error.message
    });
  }
});

// Create nginx configuration for domain
async function createNginxConfig(domain) {
  const fs = require('fs').promises;
  const path = require('path');
  const { spawn } = require('child_process');
  
  const sitesAvailable = '/etc/nginx/sites-available';
  const sitesEnabled = '/etc/nginx/sites-enabled';
  const configPath = path.join(sitesAvailable, domain);
  
  // Generate nginx configuration
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
    // Write nginx configuration file
    await fs.writeFile(configPath, nginxConfig);
    console.log(`Created nginx config: ${configPath}`);
    
    // Create symbolic link to enable site
    const enabledPath = path.join(sitesEnabled, domain);
    try {
      await fs.symlink(configPath, enabledPath);
      console.log(`Enabled site: ${enabledPath}`);
    } catch (linkError) {
      if (linkError.code !== 'EEXIST') {
        throw linkError;
      }
      console.log(`Site already enabled: ${enabledPath}`);
    }
    
    // Test nginx configuration
    await testNginxConfig();
    
    // Reload nginx
    await reloadNginx();
    
    return {
      configPath,
      enabledPath,
      domain
    };
    
  } catch (error) {
    console.error('Error creating nginx config:', error);
    throw error;
  }
}

// Test nginx configuration
function testNginxConfig() {
  return new Promise((resolve, reject) => {
    const process = spawn('nginx', ['-t'], { stdio: 'pipe' });
    
    let output = '';
    process.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        console.log('Nginx configuration test passed');
        resolve(output);
      } else {
        console.error('Nginx configuration test failed:', output);
        reject(new Error(`Nginx config test failed: ${output}`));
      }
    });
  });
}

// Reload nginx configuration
function reloadNginx() {
  return new Promise((resolve, reject) => {
    const process = spawn('systemctl', ['reload', 'nginx'], { stdio: 'pipe' });
    
    let output = '';
    process.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        console.log('Nginx reloaded successfully');
        resolve(output);
      } else {
        console.error('Nginx reload failed:', output);
        reject(new Error(`Nginx reload failed: ${output}`));
      }
    });
  });
}

module.exports = router;
