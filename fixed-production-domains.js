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
    
    if (!domainConfig) {
      return res.status(404).json({
        success: false,
        error: 'Domain not found',
        domain: domain
      });
    }

    // Add SSL information
    const sslInfo = sslService.getDemoSSLStatus(domain);
    
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

// Execute the domain creation script automatically
async function executeCreateDomainScript(domain) {
  return new Promise((resolve, reject) => {
    // Create the domain creation script content with proper variable handling
    const scriptContent = `#!/bin/bash

DOMAIN="${domain}"
CONFIG_FILE="/etc/nginx/sites-available/\$DOMAIN"
ENABLED_FILE="/etc/nginx/sites-enabled/\$DOMAIN"

echo "Creating nginx configuration for: \$DOMAIN"

# Create nginx configuration
cat > "\$CONFIG_FILE" << EOF
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
        try_files \\\$uri \\\$uri/ =404;
    }
    
    # PHP processing (if needed)
    location ~ \\\\.php\\\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    }
    
    # Static file caching
    location ~* \\\\.\\(jpg\\|jpeg\\|png\\|gif\\|ico\\|css\\|js\\|pdf\\|txt\\)\\\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Deny access to hidden files
    location ~ /\\\. {
        deny all;
    }
    
    # Log files
    access_log /var/log/nginx/${domain}_access.log;
    error_log /var/log/nginx/${domain}_error.log;
}
EOF

echo "✓ Created configuration file: \$CONFIG_FILE"

# Enable site
if [ ! -L "\$ENABLED_FILE" ]; then
    ln -s "\$CONFIG_FILE" "\$ENABLED_FILE"
    echo "✓ Enabled site: \$ENABLED_FILE"
else
    echo "✓ Site already enabled: \$ENABLED_FILE"
fi

# Test nginx configuration
echo "Testing nginx configuration..."
if nginx -t; then
    echo "✓ Nginx configuration test PASSED"
    
    # Reload nginx
    echo "Reloading nginx..."
    if systemctl reload nginx; then
        echo "✓ Nginx reloaded SUCCESSFULLY"
        echo "Domain \$DOMAIN added successfully!"
        echo "Document root: /var/www/html"
        echo "Configuration: \$CONFIG_FILE"
        echo "Enabled at: \$ENABLED_FILE"
    else
        echo "✗ Failed to reload nginx"
        exit 1
    fi
else
    echo "✗ Nginx configuration test FAILED"
    echo "Removing configuration files..."
    rm -f "\$CONFIG_FILE" "\$ENABLED_FILE"
    exit 1
fi`;

    console.log(`Executing domain creation script for: ${domain}`);
    
    exec(scriptContent, (error, stdout, stderr) => {
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

module.exports = router;