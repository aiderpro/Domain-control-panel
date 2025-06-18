const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs').promises;

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Simple token storage
const tokens = new Set(['simple-auth-token']);

function auth(req, res, next) {
  const token = req.headers.authorization;
  if (tokens.has(token)) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'domain2025') {
    res.json({ success: true, token: 'simple-auth-token' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Domain validation
function isValidDomain(domain) {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(domain);
}

// Scan nginx domains
async function scanDomains() {
  try {
    const files = await fs.readdir('/etc/nginx/sites-available');
    const domains = [];
    
    for (const file of files) {
      if (file === 'default' || file.startsWith('.')) continue;
      
      try {
        const content = await fs.readFile(`/etc/nginx/sites-available/${file}`, 'utf8');
        const serverMatch = content.match(/server_name\s+([^;]+);/);
        const sslMatch = content.match(/ssl_certificate/);
        
        if (serverMatch) {
          const serverNames = serverMatch[1].trim().split(/\s+/);
          domains.push({
            domain: serverNames[0],
            hasSSL: !!sslMatch,
            configFile: file
          });
        }
      } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
      }
    }
    
    return domains.sort((a, b) => a.domain.localeCompare(b.domain));
  } catch (error) {
    console.error('Scan error:', error.message);
    return [];
  }
}

// Create nginx config
async function createConfig(domain) {
  const config = `server {
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
}`;

  await fs.writeFile(`/etc/nginx/sites-available/${domain}`, config);
  
  try {
    await fs.unlink(`/etc/nginx/sites-enabled/${domain}`);
  } catch {}
  
  await fs.symlink(`/etc/nginx/sites-available/${domain}`, `/etc/nginx/sites-enabled/${domain}`);
}

// Nginx operations
function testNginx() {
  return new Promise((resolve, reject) => {
    exec('nginx -t', (error, stdout, stderr) => {
      if (error) reject(new Error(stderr));
      else resolve();
    });
  });
}

function reloadNginx() {
  return new Promise((resolve, reject) => {
    exec('systemctl reload nginx', (error, stdout, stderr) => {
      if (error) reject(new Error(stderr));
      else resolve();
    });
  });
}

// SSL operations
function installSSL(domain, email) {
  return new Promise((resolve, reject) => {
    const cmd = `certbot --nginx -d ${domain} -d www.${domain} --non-interactive --agree-tos --email ${email} --expand`;
    exec(cmd, { timeout: 300000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}

function removeSSL(domain) {
  return new Promise((resolve, reject) => {
    console.log(`Looking for SSL certificates for ${domain}...`);
    
    // List certificates to find the correct certificate name
    exec('certbot certificates', (listError, listStdout, listStderr) => {
      if (listError) {
        console.warn(`Could not list certificates: ${listStderr || listError.message}`);
        resolve(); // Continue even if we can't list certificates
        return;
      }
      
      const certificateNames = [];
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
          if (certDomains.includes(domain) || certDomains.includes(`www.${domain}`)) {
            certificateNames.push(currentCertName);
          }
          currentCertName = null;
        }
      }
      
      if (certificateNames.length === 0) {
        console.log(`No SSL certificates found for ${domain}`);
        resolve();
        return;
      }
      
      // Remove all found certificates
      let processed = 0;
      const total = certificateNames.length;
      
      certificateNames.forEach(certName => {
        const command = `certbot delete --cert-name "${certName}" --non-interactive`;
        console.log(`Removing certificate: ${certName}`);
        
        exec(command, (error, stdout, stderr) => {
          processed++;
          
          if (error) {
            console.error(`Failed to remove certificate ${certName}: ${stderr || error.message}`);
          } else {
            console.log(`Successfully removed certificate: ${certName}`);
          }
          
          if (processed === total) {
            resolve();
          }
        });
      });
    });
  });
}

// API Routes

// Get domains
app.get('/api/domains', auth, async (req, res) => {
  try {
    const domains = await scanDomains();
    res.json({
      success: true,
      domains,
      stats: {
        total: domains.length,
        withSSL: domains.filter(d => d.hasSSL).length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add domain
app.post('/api/domains', auth, async (req, res) => {
  try {
    const { domain, email, installSSL: shouldInstallSSL } = req.body;
    
    if (!domain || !isValidDomain(domain)) {
      return res.status(400).json({ error: 'Invalid domain' });
    }
    
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
    
    // Check if exists
    const existing = await scanDomains();
    if (existing.some(d => d.domain === cleanDomain)) {
      return res.status(409).json({ error: 'Domain already exists' });
    }
    
    // Create config
    await createConfig(cleanDomain);
    await testNginx();
    await reloadNginx();
    
    let sslResult = null;
    if (shouldInstallSSL && email) {
      try {
        await installSSL(cleanDomain, email);
        sslResult = { success: true };
      } catch (sslError) {
        sslResult = { success: false, error: sslError.message };
      }
    }
    
    res.json({
      success: true,
      domain: cleanDomain,
      ssl: sslResult
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete domain
app.delete('/api/domains/:domain', auth, async (req, res) => {
  try {
    const { domain } = req.params;
    const { removeSSL: shouldRemoveSSL } = req.query;
    
    console.log(`Starting domain deletion for ${domain}...`);
    let deletionSteps = [];
    
    // Step 1: Remove SSL certificate if requested
    if (shouldRemoveSSL === 'true') {
      console.log(`Removing SSL certificate for ${domain}...`);
      try {
        await removeSSL(domain);
        deletionSteps.push(`SSL certificate removed for ${domain}`);
      } catch (sslError) {
        deletionSteps.push(`SSL removal failed: ${sslError.message}`);
        console.warn(`SSL removal failed: ${sslError.message}`);
      }
    }
    
    // Step 2: Remove symbolic link
    const symlinkPath = `/etc/nginx/sites-enabled/${domain}`;
    try {
      await fs.access(symlinkPath);
      await fs.unlink(symlinkPath);
      deletionSteps.push(`Symbolic link removed: ${symlinkPath}`);
      console.log(`Symbolic link removed: ${symlinkPath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        deletionSteps.push(`Warning: Could not remove symbolic link: ${error.message}`);
      } else {
        deletionSteps.push(`Symbolic link not found: ${symlinkPath}`);
      }
    }
    
    // Step 3: Remove configuration file
    const configPath = `/etc/nginx/sites-available/${domain}`;
    try {
      await fs.access(configPath);
      await fs.unlink(configPath);
      deletionSteps.push(`Configuration file removed: ${configPath}`);
      console.log(`Configuration file removed: ${configPath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        deletionSteps.push(`Error removing configuration file: ${error.message}`);
        throw error;
      } else {
        deletionSteps.push(`Configuration file not found: ${configPath}`);
      }
    }
    
    // Step 4: Test and reload nginx
    await testNginx();
    deletionSteps.push(`Nginx configuration test: PASSED`);
    
    await reloadNginx();
    deletionSteps.push(`Nginx reload: SUCCESS`);
    
    // Step 5: Verify deletion
    try {
      await fs.access(configPath);
      throw new Error(`Configuration file still exists: ${configPath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        deletionSteps.push(`Verification: Files successfully removed`);
      } else {
        throw error;
      }
    }
    
    console.log(`Domain deletion completed for ${domain}`);
    
    res.json({ 
      success: true, 
      domain,
      deletionSteps,
      filesRemoved: {
        configFile: configPath,
        symbolicLink: symlinkPath
      }
    });
  } catch (error) {
    console.error(`Domain deletion failed for ${domain}:`, error.message);
    res.status(500).json({ error: error.message, domain });
  }
});

// Install SSL
app.post('/api/domains/:domain/ssl', auth, async (req, res) => {
  try {
    const { domain } = req.params;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    await installSSL(domain, email);
    res.json({ success: true, domain });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove SSL
app.delete('/api/domains/:domain/ssl', auth, async (req, res) => {
  try {
    const { domain } = req.params;
    await removeSSL(domain);
    res.json({ success: true, domain });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'simple-domains.html'));
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Simple Domain Manager running on port ${PORT}`);
});

module.exports = app;