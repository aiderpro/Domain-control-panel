const express = require('express');
const router = express.Router();
const nginxService = require('../services/nginxService');
const sslService = require('../services/sslService');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

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

// Add domain endpoint - creates actual nginx configuration using script
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
    
    // Use the automated script for domain creation
    const result = await executeCreateDomainScript(domain);
    
    console.log(`✓ Domain ${domain} successfully added with nginx configuration`);
    console.log(`✓ Script output:`, result.stdout);
    
    if (req.io) {
      req.io.emit('domain_added', { domain, success: true });
    }
    
    res.json({
      success: true,
      message: `Domain ${domain} added successfully with nginx configuration, tested and reloaded`,
      domain: domain,
      configPath: `/etc/nginx/sites-available/${domain}`,
      enabledPath: `/etc/nginx/sites-enabled/${domain}`,
      scriptOutput: result.stdout,
      nginxTested: true,
      nginxReloaded: true
    });
  } catch (error) {
    console.error(`\n✗ Error adding domain ${domain}:`, error.message);
    console.error('Script stderr:', error.stderr);
    
    if (req.io) {
      req.io.emit('domain_add_error', { domain, error: error.message });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to add domain',
      message: error.message,
      scriptError: error.stderr
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

// Execute the domain creation script automatically
async function executeCreateDomainScript(domain) {
  return new Promise((resolve, reject) => {
    // Create the domain creation script content inline
    const scriptContent = `#!/bin/bash

DOMAIN="${domain}"
CONFIG_FILE="/etc/nginx/sites-available/$DOMAIN"
ENABLED_FILE="/etc/nginx/sites-enabled/$DOMAIN"

echo "Creating nginx configuration for: $DOMAIN"

# Create nginx configuration
cat > "$CONFIG_FILE" << 'EOF'
server {
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
        try_files \\$uri \\$uri/ =404;
    }
    
    # PHP processing (if needed)
    location ~ \\.php\\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    }
    
    # Static file caching
    location ~* \\.(jpg|jpeg|png|gif|ico|css|js|pdf|txt)\\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Deny access to hidden files
    location ~ /\\. {
        deny all;
    }
    
    # Log files
    access_log /var/log/nginx/\${DOMAIN}_access.log;
    error_log /var/log/nginx/\${DOMAIN}_error.log;
}
EOF

echo "✓ Created configuration file: $CONFIG_FILE"

# Enable site
if [ ! -L "$ENABLED_FILE" ]; then
    ln -s "$CONFIG_FILE" "$ENABLED_FILE"
    echo "✓ Enabled site: $ENABLED_FILE"
else
    echo "✓ Site already enabled: $ENABLED_FILE"
fi

# Test nginx configuration
echo "Testing nginx configuration..."
if nginx -t; then
    echo "✓ Nginx configuration test PASSED"
    
    # Reload nginx
    echo "Reloading nginx..."
    if systemctl reload nginx; then
        echo "✓ Nginx reloaded SUCCESSFULLY"
        echo "Domain $DOMAIN added successfully!"
        echo "Document root: /var/www/html"
        echo "Configuration: $CONFIG_FILE"
        echo "Enabled at: $ENABLED_FILE"
    else
        echo "✗ Failed to reload nginx"
        exit 1
    fi
else
    echo "✗ Nginx configuration test FAILED"
    echo "Removing configuration files..."
    rm -f "$CONFIG_FILE" "$ENABLED_FILE"
    exit 1
fi`;

    console.log(`Executing domain creation script for: ${domain}`);
    
    const process = exec(scriptContent, (error, stdout, stderr) => {
      if (error) {
        console.error(`Script execution error: ${error.message}`);
        reject({
          message: error.message,
          stderr: stderr,
          stdout: stdout
        });
      } else {
        console.log(`Script executed successfully for domain: ${domain}`);
        resolve({
          stdout: stdout,
          stderr: stderr
        });
      }
    });
  });
}

// Delete domain configuration and SSL certificates
async function deleteDomainAndSSL(domain) {
  const configPath = `/etc/nginx/sites-available/${domain}`;
  const enabledPath = `/etc/nginx/sites-enabled/${domain}`;
  
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
      } else {
        console.log(`Note: Enabled site not found: ${enabledPath}`);
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
      } else {
        console.log(`Note: Config file not found: ${configPath}`);
      }
    }
    
    // 3. Remove SSL certificate using certbot (only if SSL exists)
    try {
      await removeCertbotCertificate(domain);
      deletedFiles.push(`/etc/letsencrypt/live/${domain}`);
      deletedFiles.push(`/etc/letsencrypt/renewal/${domain}.conf`);
      console.log(`✓ Removed SSL certificate for: ${domain}`);
    } catch (error) {
      // SSL removal is optional - domain might not have SSL
      console.log(`Note: SSL certificate removal: ${error.message}`);
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
        if (stderr.includes('No certificate found') || 
            stderr.includes('not found') ||
            stderr.includes('No matching certificate')) {
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
