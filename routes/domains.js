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
    console.log(`\n=== Creating nginx configuration for domain: ${domain} ===`);
    
    const nginxConfig = await createNginxConfig(domain);
    
    console.log(`✓ Domain ${domain} successfully added with nginx configuration`);
    console.log(`✓ Config file: ${nginxConfig.configPath}`);
    console.log(`✓ Enabled at: ${nginxConfig.enabledPath}`);
    console.log(`✓ Nginx tested and reloaded successfully`);
    
    if (req.io) {
      req.io.emit('domain_added', { domain, success: true });
    }
    
    res.json({
      success: true,
      message: `Domain ${domain} added successfully with nginx configuration, tested and reloaded`,
      domain: domain,
      configPath: `/etc/nginx/sites-available/${domain}`,
      enabledPath: `/etc/nginx/sites-enabled/${domain}`,
      nginxTested: true,
      nginxReloaded: true
    });
  } catch (error) {
    console.error(`\n✗ Error adding domain ${domain}:`, error.message);
    console.error('Full error details:', error);
    
    if (req.io) {
      req.io.emit('domain_add_error', { domain, error: error.message });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to add domain',
      message: error.message,
      details: error.stack
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
    // Ensure nginx directories exist
    await fs.mkdir(sitesAvailable, { recursive: true });
    await fs.mkdir(sitesEnabled, { recursive: true });
    console.log(`Verified nginx directories exist`);
    
    // Ensure document root exists
    await fs.mkdir('/var/www/html', { recursive: true });
    console.log(`Verified document root /var/www/html exists`);
    
    // Write nginx configuration file
    await fs.writeFile(configPath, nginxConfig);
    console.log(`✓ Created nginx config: ${configPath}`);
    
    // Create symbolic link to enable site
    const enabledPath = path.join(sitesEnabled, domain);
    try {
      await fs.symlink(configPath, enabledPath);
      console.log(`✓ Enabled site: ${enabledPath}`);
    } catch (linkError) {
      if (linkError.code !== 'EEXIST') {
        throw linkError;
      }
      console.log(`✓ Site already enabled: ${enabledPath}`);
    }
    
    // Test nginx configuration
    console.log(`Testing nginx configuration...`);
    await testNginxConfig();
    
    // Reload nginx
    console.log(`Reloading nginx...`);
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

// Test nginx configuration with detailed logging
function testNginxConfig() {
  return new Promise((resolve, reject) => {
    console.log('Running nginx configuration test: nginx -t');
    const process = spawn('nginx', ['-t'], { stdio: 'pipe' });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      const output = stderr + stdout;
      console.log(`Nginx test exit code: ${code}`);
      console.log(`Nginx test output: ${output}`);
      
      if (code === 0) {
        console.log('✓ Nginx configuration test PASSED');
        resolve(output);
      } else {
        console.error('✗ Nginx configuration test FAILED');
        console.error('Error details:', output);
        reject(new Error(`Nginx configuration test failed (exit code ${code}): ${output}`));
      }
    });
    
    process.on('error', (error) => {
      console.error('Error spawning nginx test process:', error);
      reject(new Error(`Failed to run nginx test: ${error.message}`));
    });
  });
}

// Reload nginx configuration with detailed logging
function reloadNginx() {
  return new Promise((resolve, reject) => {
    console.log('Reloading nginx configuration: systemctl reload nginx');
    const process = spawn('systemctl', ['reload', 'nginx'], { stdio: 'pipe' });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      const output = stderr + stdout;
      console.log(`Nginx reload exit code: ${code}`);
      console.log(`Nginx reload output: ${output}`);
      
      if (code === 0) {
        console.log('✓ Nginx reloaded SUCCESSFULLY');
        resolve(output);
      } else {
        console.error('✗ Nginx reload FAILED');
        console.error('Error details:', output);
        reject(new Error(`Nginx reload failed (exit code ${code}): ${output}`));
      }
    });
    
    process.on('error', (error) => {
      console.error('Error spawning nginx reload process:', error);
      reject(new Error(`Failed to reload nginx: ${error.message}`));
    });
  });
}

module.exports = router;
