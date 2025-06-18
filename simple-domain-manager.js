const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs').promises;

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'https://cpanel.webeezix.in', 'https://sitedev.eezix.com'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple authentication
const activeTokens = new Set();

function requireAuth(req, res, next) {
  const token = req.headers.authorization || req.query.token;
  if (token && activeTokens.has(token)) {
    return next();
  } else {
    return res.status(401).json({ 
      error: 'Authentication required',
      loginRequired: true 
    });
  }
}

const server = http.createServer(app);

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'admin' && password === 'domain2025') {
    const token = 'auth-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    activeTokens.add(token);
    
    res.json({
      success: true,
      message: 'Login successful',
      token: token,
      user: { username: username }
    });
  } else {
    res.status(401).json({
      success: false,
      error: 'Invalid username or password'
    });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  const token = req.headers.authorization;
  if (token) {
    activeTokens.delete(token);
  }
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// Domain validation function
function validateDomain(domain) {
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  return domainRegex.test(domain);
}

// Get all domains from nginx configurations
async function scanNginxDomains() {
  try {
    const sitesPath = '/etc/nginx/sites-available';
    const files = await fs.readdir(sitesPath);
    const domains = [];

    for (const file of files) {
      if (file === 'default' || file.startsWith('.')) continue;
      
      try {
        const configPath = path.join(sitesPath, file);
        const content = await fs.readFile(configPath, 'utf8');
        
        const serverNameMatch = content.match(/server_name\s+([^;]+);/);
        const sslCertMatch = content.match(/ssl_certificate\s+([^;]+);/);
        const listenMatch = content.match(/listen\s+(\d+)/g);
        
        if (serverNameMatch) {
          const serverNames = serverNameMatch[1].trim().split(/\s+/);
          const mainDomain = serverNames[0];
          
          domains.push({
            domain: mainDomain,
            configFile: file,
            configPath: configPath,
            hasSSL: !!sslCertMatch,
            ports: listenMatch ? listenMatch.map(m => parseInt(m.match(/\d+/)[0])) : [80],
            serverNames: serverNames
          });
        }
      } catch (error) {
        console.error(`Error reading config file ${file}:`, error.message);
      }
    }

    return domains.sort((a, b) => a.domain.localeCompare(b.domain));
  } catch (error) {
    console.error('Error scanning nginx domains:', error);
    return [];
  }
}

// Create nginx configuration for new domain
async function createNginxConfig(domain) {
  const configContent = `server {
    listen 80;
    server_name ${domain} www.${domain};
    
    root /var/www/html;
    index index.html index.htm index.php;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    }
    
    location ~ /\\.ht {
        deny all;
    }
}`;

  const configPath = `/etc/nginx/sites-available/${domain}`;
  await fs.writeFile(configPath, configContent);
  
  // Enable the site by creating symlink
  const symlinkPath = `/etc/nginx/sites-enabled/${domain}`;
  try {
    await fs.unlink(symlinkPath);
  } catch (error) {
    // Symlink might not exist, that's okay
  }
  
  await fs.symlink(configPath, symlinkPath);
  
  return configPath;
}

// Test nginx configuration
function testNginxConfig() {
  return new Promise((resolve, reject) => {
    exec('nginx -t', (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Nginx configuration test failed: ${stderr}`));
      } else {
        resolve(true);
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
        resolve(true);
      }
    });
  });
}

// Install SSL certificate for domain
function installSSLCertificate(domain, email) {
  return new Promise((resolve, reject) => {
    const command = `certbot --nginx -d ${domain} -d www.${domain} --non-interactive --agree-tos --email ${email} --expand --allow-subset-of-names`;
    
    exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`SSL installation failed: ${stderr || error.message}`));
      } else {
        resolve({
          success: true,
          message: `SSL certificate installed successfully for ${domain}`,
          output: stdout
        });
      }
    });
  });
}

// Remove SSL certificate for domain
function removeSSLCertificate(domain) {
  return new Promise((resolve, reject) => {
    console.log(`Attempting to remove SSL certificate for ${domain}`);
    
    // First, list all certificates to find the correct certificate name
    exec('certbot certificates', (listError, listStdout, listStderr) => {
      if (listError) {
        console.warn(`Could not list certificates: ${listStderr || listError.message}`);
        resolve({ success: false, message: 'Could not list certificates, SSL removal skipped' });
        return;
      }
      
      const certificateNames = [];
      
      // Parse certificate output to find matching certificates
      const lines = listStdout.split('\n');
      let currentCertName = null;
      
      for (const line of lines) {
        const certNameMatch = line.match(/Certificate Name: (.+)/);
        const domainsMatch = line.match(/Domains: (.+)/);
        
        if (certNameMatch) {
          currentCertName = certNameMatch[1].trim();
        }
        
        if (domainsMatch && currentCertName) {
          const certDomains = domainsMatch[1].split(' ').map(d => d.trim());
          // Check if this certificate covers our domain
          if (certDomains.includes(domain) || certDomains.includes(`www.${domain}`)) {
            certificateNames.push(currentCertName);
          }
          currentCertName = null;
        }
      }
      
      if (certificateNames.length === 0) {
        console.log(`No SSL certificates found for ${domain}`);
        resolve({ success: true, message: 'No SSL certificates found for this domain' });
        return;
      }
      
      // Remove all found certificates
      let removedCount = 0;
      let errors = [];
      
      const removeCertificate = (certName, callback) => {
        const command = `certbot delete --cert-name "${certName}" --non-interactive`;
        console.log(`Removing certificate: ${certName}`);
        
        exec(command, (error, stdout, stderr) => {
          if (error) {
            const errorMsg = `Failed to remove certificate ${certName}: ${stderr || error.message}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          } else {
            console.log(`Successfully removed certificate: ${certName}`);
            removedCount++;
          }
          callback();
        });
      };
      
      // Remove certificates sequentially
      let index = 0;
      const removeNext = () => {
        if (index >= certificateNames.length) {
          // All certificates processed
          if (removedCount > 0) {
            resolve({ 
              success: true, 
              message: `Successfully removed ${removedCount} SSL certificate(s) for ${domain}`,
              removedCertificates: certificateNames.slice(0, removedCount),
              errors: errors.length > 0 ? errors : null
            });
          } else {
            resolve({ 
              success: false, 
              message: `Failed to remove SSL certificates for ${domain}`,
              errors: errors
            });
          }
          return;
        }
        
        removeCertificate(certificateNames[index], () => {
          index++;
          removeNext();
        });
      };
      
      removeNext();
    });
  });
}

// Get all domains
app.get('/api/domains', requireAuth, async (req, res) => {
  try {
    const domains = await scanNginxDomains();
    
    res.json({
      success: true,
      domains: domains,
      stats: {
        total: domains.length,
        withSSL: domains.filter(d => d.hasSSL).length,
        withoutSSL: domains.filter(d => !d.hasSSL).length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching domains:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch domains',
      message: error.message
    });
  }
});

// Add new domain
app.post('/api/domains', requireAuth, async (req, res) => {
  try {
    const { domain, installSSL, email } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain name is required'
      });
    }

    // Clean and validate domain
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '').trim();
    
    if (!validateDomain(cleanDomain)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid domain format'
      });
    }

    // Check if domain already exists
    const existingDomains = await scanNginxDomains();
    const domainExists = existingDomains.some(d => d.domain === cleanDomain);
    
    if (domainExists) {
      return res.status(409).json({
        success: false,
        error: 'Domain already exists'
      });
    }

    // Create nginx configuration
    console.log(`Creating nginx configuration for ${cleanDomain}...`);
    const configPath = await createNginxConfig(cleanDomain);

    // Test nginx configuration
    await testNginxConfig();

    // Reload nginx
    await reloadNginx();

    let sslResult = null;
    
    // Install SSL if requested
    if (installSSL && email) {
      console.log(`Installing SSL certificate for ${cleanDomain}...`);
      try {
        sslResult = await installSSLCertificate(cleanDomain, email);
      } catch (sslError) {
        console.error(`SSL installation failed for ${cleanDomain}:`, sslError.message);
        sslResult = {
          success: false,
          error: sslError.message
        };
      }
    }

    res.json({
      success: true,
      message: `Domain ${cleanDomain} added successfully`,
      domain: cleanDomain,
      configPath: configPath,
      ssl: sslResult,
      timestamp: new Date().toISOString()
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

// Delete domain
app.delete('/api/domains/:domain', requireAuth, async (req, res) => {
  try {
    const { domain } = req.params;
    const { removeSSL } = req.query;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain name is required'
      });
    }

    console.log(`Starting domain deletion process for ${domain}...`);

    let sslResult = null;
    let deletionSteps = [];

    // Step 1: Remove SSL certificate if requested
    if (removeSSL === 'true') {
      console.log(`Step 1: Removing SSL certificate for ${domain}...`);
      try {
        sslResult = await removeSSLCertificate(domain);
        deletionSteps.push(`SSL certificate removed: ${sslResult.message}`);
        console.log(`✓ SSL certificate removal completed for ${domain}`);
      } catch (sslError) {
        console.error(`SSL removal failed for ${domain}:`, sslError.message);
        sslResult = {
          success: false,
          error: sslError.message
        };
        deletionSteps.push(`SSL removal failed: ${sslError.message}`);
      }
    }

    // Step 2: Remove symbolic link from sites-enabled
    const symlinkPath = `/etc/nginx/sites-enabled/${domain}`;
    console.log(`Step 2: Removing symbolic link: ${symlinkPath}`);
    try {
      await fs.access(symlinkPath);
      await fs.unlink(symlinkPath);
      deletionSteps.push(`Symbolic link removed: ${symlinkPath}`);
      console.log(`✓ Symbolic link removed: ${symlinkPath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        deletionSteps.push(`Symbolic link not found (already removed): ${symlinkPath}`);
        console.log(`- Symbolic link not found: ${symlinkPath}`);
      } else {
        deletionSteps.push(`Warning: Could not remove symbolic link: ${error.message}`);
        console.warn(`Warning: Could not remove symbolic link: ${error.message}`);
      }
    }

    // Step 3: Remove configuration file from sites-available
    const configPath = `/etc/nginx/sites-available/${domain}`;
    console.log(`Step 3: Removing configuration file: ${configPath}`);
    try {
      await fs.access(configPath);
      await fs.unlink(configPath);
      deletionSteps.push(`Configuration file removed: ${configPath}`);
      console.log(`✓ Configuration file removed: ${configPath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        deletionSteps.push(`Configuration file not found: ${configPath}`);
        console.log(`- Configuration file not found: ${configPath}`);
      } else {
        deletionSteps.push(`Error removing configuration file: ${error.message}`);
        console.error(`Error removing configuration file: ${error.message}`);
        throw error;
      }
    }

    // Step 4: Test nginx configuration
    console.log(`Step 4: Testing nginx configuration...`);
    try {
      await testNginxConfig();
      deletionSteps.push(`Nginx configuration test: PASSED`);
      console.log(`✓ Nginx configuration test passed`);
    } catch (testError) {
      deletionSteps.push(`Nginx configuration test: FAILED - ${testError.message}`);
      console.error(`Nginx configuration test failed: ${testError.message}`);
      throw new Error(`Nginx configuration test failed after domain deletion: ${testError.message}`);
    }

    // Step 5: Reload nginx
    console.log(`Step 5: Reloading nginx...`);
    try {
      await reloadNginx();
      deletionSteps.push(`Nginx reload: SUCCESS`);
      console.log(`✓ Nginx reloaded successfully`);
    } catch (reloadError) {
      deletionSteps.push(`Nginx reload: FAILED - ${reloadError.message}`);
      console.error(`Nginx reload failed: ${reloadError.message}`);
      throw new Error(`Nginx reload failed: ${reloadError.message}`);
    }

    // Step 6: Verify deletion
    console.log(`Step 6: Verifying domain deletion...`);
    try {
      await fs.access(configPath);
      throw new Error(`Configuration file still exists after deletion: ${configPath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        deletionSteps.push(`Verification: Configuration file successfully removed`);
        console.log(`✓ Verification passed: Configuration file no longer exists`);
      } else {
        throw error;
      }
    }

    try {
      await fs.access(symlinkPath);
      throw new Error(`Symbolic link still exists after deletion: ${symlinkPath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        deletionSteps.push(`Verification: Symbolic link successfully removed`);
        console.log(`✓ Verification passed: Symbolic link no longer exists`);
      } else {
        throw error;
      }
    }

    console.log(`✅ Domain deletion completed successfully for ${domain}`);

    res.json({
      success: true,
      message: `Domain ${domain} deleted successfully`,
      domain: domain,
      ssl: sslResult,
      deletionSteps: deletionSteps,
      filesRemoved: {
        configFile: configPath,
        symbolicLink: symlinkPath
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`❌ Error deleting domain ${req.params.domain}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete domain',
      message: error.message,
      domain: req.params.domain,
      timestamp: new Date().toISOString()
    });
  }
});

// Install SSL for existing domain
app.post('/api/domains/:domain/ssl', requireAuth, async (req, res) => {
  try {
    const { domain } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required for SSL certificate'
      });
    }

    console.log(`Installing SSL certificate for ${domain}...`);
    
    const result = await installSSLCertificate(domain, email);

    res.json({
      success: true,
      message: `SSL certificate installed successfully for ${domain}`,
      domain: domain,
      result: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error installing SSL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to install SSL certificate',
      message: error.message
    });
  }
});

// Remove SSL for existing domain
app.delete('/api/domains/:domain/ssl', requireAuth, async (req, res) => {
  try {
    const { domain } = req.params;

    console.log(`Removing SSL certificate for ${domain}...`);
    
    const result = await removeSSLCertificate(domain);

    res.json({
      success: true,
      message: `SSL certificate removed for ${domain}`,
      domain: domain,
      result: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error removing SSL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove SSL certificate',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'Simple Domain Manager',
    timestamp: new Date().toISOString() 
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Simple Domain Manager is running',
    features: [
      'Add domains with nginx configuration',
      'Delete domains and SSL certificates',
      'Install/remove SSL certificates',
      'List all configured domains'
    ],
    timestamp: new Date().toISOString()
  });
});

// Serve simple domain manager interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'simple-domains.html'));
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Simple Domain Manager running on port ${PORT}`);
  console.log(`Features: Domain management, SSL installation/removal`);
  console.log(`Access the application at http://localhost:${PORT}`);
});

module.exports = app;