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
    exec(`certbot delete --cert-name ${domain} --non-interactive`, (error) => {
      if (error) {
        exec(`certbot delete --cert-name www.${domain} --non-interactive`, (altError) => {
          resolve(); // Continue even if SSL removal fails
        });
      } else {
        resolve();
      }
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
    
    if (shouldRemoveSSL === 'true') {
      await removeSSL(domain);
    }
    
    // Remove files
    try {
      await fs.unlink(`/etc/nginx/sites-enabled/${domain}`);
    } catch {}
    
    try {
      await fs.unlink(`/etc/nginx/sites-available/${domain}`);
    } catch {}
    
    await testNginx();
    await reloadNginx();
    
    res.json({ success: true, domain });
  } catch (error) {
    res.status(500).json({ error: error.message });
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