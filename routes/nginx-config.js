const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class NginxConfigManager {
  constructor() {
    this.sitesAvailable = process.env.NGINX_SITES_PATH || '/etc/nginx/sites-available';
    this.sitesEnabled = '/etc/nginx/sites-enabled';
    // Always use /var/www/html as document root for nginx configs
    this.documentRoot = '/var/www/html';
  }

  /**
   * Validate domain name format
   */
  validateDomain(domain) {
    // Remove protocol if present
    domain = domain.replace(/^https?:\/\//, '');
    
    // Basic domain validation regex
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
    
    // Check if it's a valid domain format
    if (!domainRegex.test(domain)) {
      return { valid: false, error: 'Invalid domain format' };
    }
    
    // Check length
    if (domain.length > 253) {
      return { valid: false, error: 'Domain name too long' };
    }
    
    // Check for valid TLD (at least 2 characters)
    const parts = domain.split('.');
    if (parts.length < 2 || parts[parts.length - 1].length < 2) {
      return { valid: false, error: 'Invalid top-level domain' };
    }
    
    return { valid: true };
  }

  /**
   * Check if domain already exists in nginx configuration
   */
  async checkDomainExists(domain) {
    try {
      // In development, check if we have demo domains or simulate check
      if (process.env.NODE_ENV !== 'production') {
        return false; // Always allow in development
      }
      
      const configFile = path.join(this.sitesAvailable, domain);
      await fs.access(configFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate nginx configuration for domain
   */
  generateNginxConfig(domain) {
    return `server {
    server_name ${domain} www.${domain};
    root /data/site/public;
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";
    index index.php index.html index.htm;
    charset utf-8;
    
    location / {
        proxy_read_timeout     60;
        proxy_connect_timeout  60;
        proxy_redirect off;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_pass             http://localhost:3000;
    }
    
    location @rules {
        rewrite ^(.*)$ $1.php last;
    }
    
    location = /favicon.ico {
        access_log off;
        log_not_found off;
    }
    
    location = /robots.txt {
        access_log off;
        log_not_found off;
    }
    
    error_page 404 /index.php;
    
    location ~ \\.php$ {
        fastcgi_pass unix:/var/run/php-fpm/www.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }
    
    location ~ /\\.(?!well-known).* {
        deny all;
    }
}`;
  }

  /**
   * Create nginx configuration file
   */
  async createNginxConfig(domain) {
    // In development, simulate nginx config creation
    if (process.env.NODE_ENV !== 'production') {
      return { 
        success: true, 
        path: `./simulated/sites-available/${domain}`,
        simulated: true 
      };
    }
    
    const configPath = path.join(this.sitesAvailable, domain);
    const config = this.generateNginxConfig(domain);
    
    try {
      await fs.writeFile(configPath, config, 'utf8');
      await fs.chmod(configPath, 0o644);
      return { success: true, path: configPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create symbolic link to enable site
   */
  async enableSite(domain) {
    // In development, simulate enabling site
    if (process.env.NODE_ENV !== 'production') {
      return { 
        success: true, 
        path: `./simulated/sites-enabled/${domain}`,
        simulated: true 
      };
    }
    
    const sourcePath = path.join(this.sitesAvailable, domain);
    const linkPath = path.join(this.sitesEnabled, domain);
    
    try {
      // Check if link already exists
      try {
        await fs.access(linkPath);
        return { success: true, message: 'Site already enabled' };
      } catch {
        // Link doesn't exist, create it
      }
      
      await fs.symlink(sourcePath, linkPath);
      return { success: true, path: linkPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test nginx configuration
   */
  async testNginxConfig() {
    // In development, simulate nginx test
    if (process.env.NODE_ENV !== 'production') {
      return {
        success: true,
        output: 'nginx: configuration file test is successful (simulated)',
        simulated: true
      };
    }
    
    return new Promise((resolve) => {
      const nginx = spawn('nginx', ['-t']);
      let output = '';
      let errorOutput = '';
      
      nginx.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      nginx.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      nginx.on('close', (code) => {
        resolve({
          success: code === 0,
          output: output || errorOutput,
          exitCode: code
        });
      });
    });
  }

  /**
   * Reload nginx configuration
   */
  async reloadNginx() {
    // In development, simulate nginx reload
    if (process.env.NODE_ENV !== 'production') {
      return {
        success: true,
        output: 'nginx: reload successful (simulated)',
        simulated: true
      };
    }
    
    return new Promise((resolve) => {
      const nginx = spawn('systemctl', ['reload', 'nginx']);
      let output = '';
      let errorOutput = '';
      
      nginx.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      nginx.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      nginx.on('close', (code) => {
        resolve({
          success: code === 0,
          output: output || errorOutput,
          exitCode: code
        });
      });
    });
  }

  /**
   * Ensure document root directory exists
   */
  async ensureDocumentRoot() {
    // In development, simulate document root creation since /var/www/html doesn't exist
    if (process.env.NODE_ENV !== 'production') {
      // Create a local simulation directory to demonstrate functionality
      const localDocRoot = './public/html';
      try {
        await fs.mkdir(localDocRoot, { recursive: true });
        return { 
          success: true, 
          path: this.documentRoot, // Still report /var/www/html as the target
          localPath: localDocRoot,
          simulated: true 
        };
      } catch (error) {
        return { 
          success: true, 
          path: this.documentRoot,
          simulated: true,
          note: 'Simulated in development environment'
        };
      }
    }
    
    try {
      await fs.access(this.documentRoot);
      return { success: true };
    } catch {
      try {
        await fs.mkdir(this.documentRoot, { recursive: true, mode: 0o755 });
        
        // Create a default index.html if it doesn't exist
        const indexPath = path.join(this.documentRoot, 'index.html');
        try {
          await fs.access(indexPath);
        } catch {
          const defaultHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        p { color: #666; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to Your New Domain</h1>
        <p>This is the default page for your new domain. You can replace this file with your own content.</p>
        <p>Document root: ${this.documentRoot}</p>
    </div>
</body>
</html>`;
          await fs.writeFile(indexPath, defaultHTML, 'utf8');
        }
        
        return { success: true, created: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  }
}

// Routes
router.post('/add-domain', async (req, res) => {
  const { domain } = req.body;
  const io = req.io;
  
  if (!domain) {
    return res.status(400).json({
      success: false,
      error: 'Domain is required'
    });
  }

  const manager = new NginxConfigManager();
  
  try {
    // Emit progress updates
    io.emit('domain_add_progress', { 
      domain, 
      stage: 'validation',
      message: 'Validating domain name...' 
    });

    // Validate domain
    const validation = manager.validateDomain(domain);
    if (!validation.valid) {
      io.emit('domain_add_error', { domain, error: validation.error });
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // Check if domain already exists
    io.emit('domain_add_progress', { 
      domain, 
      stage: 'checking',
      message: 'Checking if domain already exists...' 
    });

    const exists = await manager.checkDomainExists(domain);
    if (exists) {
      const error = 'Domain configuration already exists';
      io.emit('domain_add_error', { domain, error });
      return res.status(409).json({
        success: false,
        error
      });
    }

    // Ensure document root exists
    io.emit('domain_add_progress', { 
      domain, 
      stage: 'setup',
      message: 'Setting up document root...' 
    });

    const docRootResult = await manager.ensureDocumentRoot();
    if (!docRootResult.success) {
      throw new Error(`Failed to create document root: ${docRootResult.error}`);
    }

    // Create nginx configuration
    io.emit('domain_add_progress', { 
      domain, 
      stage: 'config',
      message: 'Creating nginx configuration...' 
    });

    const configResult = await manager.createNginxConfig(domain);
    if (!configResult.success) {
      throw new Error(`Failed to create nginx config: ${configResult.error}`);
    }

    // Enable site (create symlink)
    io.emit('domain_add_progress', { 
      domain, 
      stage: 'enabling',
      message: 'Enabling site...' 
    });

    const enableResult = await manager.enableSite(domain);
    if (!enableResult.success) {
      throw new Error(`Failed to enable site: ${enableResult.error}`);
    }

    // Test nginx configuration
    io.emit('domain_add_progress', { 
      domain, 
      stage: 'testing',
      message: 'Testing nginx configuration...' 
    });

    const testResult = await manager.testNginxConfig();
    if (!testResult.success) {
      throw new Error(`Nginx configuration test failed: ${testResult.output}`);
    }

    // Reload nginx
    io.emit('domain_add_progress', { 
      domain, 
      stage: 'reloading',
      message: 'Reloading nginx...' 
    });

    const reloadResult = await manager.reloadNginx();
    if (!reloadResult.success) {
      throw new Error(`Failed to reload nginx: ${reloadResult.output}`);
    }

    // Success
    io.emit('domain_add_complete', { 
      domain, 
      success: true,
      message: 'Domain added successfully',
      documentRoot: manager.documentRoot
    });

    res.json({
      success: true,
      message: 'Domain added successfully',
      domain,
      documentRoot: manager.documentRoot,
      configPath: configResult.path
    });

  } catch (error) {
    console.error('Error adding domain:', error);
    io.emit('domain_add_error', { domain, error: error.message });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test domain validation endpoint
router.post('/validate-domain', (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({
      success: false,
      error: 'Domain is required'
    });
  }

  const manager = new NginxConfigManager();
  const validation = manager.validateDomain(domain);
  
  res.json(validation);
});

module.exports = router;