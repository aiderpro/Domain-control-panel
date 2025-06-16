const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class NginxService {
  constructor() {
    this.sitesAvailablePath = '/etc/nginx/sites-available';
    this.sitesEnabledPath = '/etc/nginx/sites-enabled';
  }

  /**
   * Scan and parse all domain configurations from nginx sites-available
   */
  async scanDomains() {
    try {
      // Check if nginx directory exists
      await fs.access(this.sitesAvailablePath);
      
      const files = await fs.readdir(this.sitesAvailablePath);
      const domains = [];

      for (const file of files) {
        // Skip default and non-config files
        if (file === 'default' || file.startsWith('.')) {
          continue;
        }

        try {
          const config = await this.parseDomainConfig(file);
          if (config) {
            domains.push(config);
          }
        } catch (error) {
          console.error(`Error parsing config for ${file}:`, error);
          // Include failed configs with error info
          domains.push({
            filename: file,
            domain: file,
            status: 'error',
            error: error.message,
            enabled: false
          });
        }
      }

      return domains;
    } catch (error) {
      console.error('Error scanning nginx domains:', error);
      
      // If nginx directory doesn't exist, return demo data for testing
      if (error.code === 'ENOENT') {
        console.log('Nginx directory not found, returning demo domains for testing');
        return this.getDemoDomains();
      }
      
      throw new Error(`Failed to scan nginx domains: ${error.message}`);
    }
  }

  /**
   * Get demo domains for testing when nginx is not available
   */
  getDemoDomains() {
    const baseDomains = [
      'example.com', 'test.com', 'sitedev.eezix.com', 'demo.local', 'mysite.org',
      'webstore.net', 'blog.co', 'portfolio.dev', 'company.biz', 'startup.io'
    ];
    
    const tlds = ['.com', '.net', '.org', '.io', '.dev', '.co', '.biz', '.app', '.tech', '.online'];
    const prefixes = ['www', 'api', 'admin', 'blog', 'shop', 'app', 'mail', 'cdn', 'static', 'media'];
    const domains = [];
    
    // Generate a variety of demo domains to simulate 50+ domains
    for (let i = 1; i <= 50; i++) {
      const tld = tlds[i % tlds.length];
      const prefix = i % 3 === 0 ? prefixes[i % prefixes.length] + '.' : '';
      const baseName = `domain${i}`;
      const fullDomain = `${prefix}${baseName}${tld}`;
      
      // Vary SSL status - some have SSL, some don't, some are expiring
      const hasSSL = i % 4 !== 0; // 75% have SSL
      const isExpiring = hasSSL && i % 7 === 0; // Some are expiring
      const isExpired = hasSSL && i % 15 === 0; // Some are expired
      const isEnabled = i % 10 !== 0; // 90% are enabled
      
      domains.push({
        filename: fullDomain,
        domain: fullDomain,
        serverNames: i % 3 === 0 ? [fullDomain, `www.${fullDomain}`] : [fullDomain],
        documentRoot: `/var/www/${fullDomain}`,
        sslCertificate: hasSSL ? `/etc/letsencrypt/live/${fullDomain}/fullchain.pem` : null,
        sslCertificateKey: hasSSL ? `/etc/letsencrypt/live/${fullDomain}/privkey.pem` : null,
        enabled: isEnabled,
        hasSSLConfig: hasSSL,
        ports: hasSSL ? [80, 443] : [80],
        status: isEnabled ? 'active' : 'inactive'
      });
    }
    
    // Add the original demo domains
    domains.unshift(
      {
        filename: 'example.com',
        domain: 'example.com',
        serverNames: ['example.com', 'www.example.com'],
        documentRoot: '/var/www/example.com',
        sslCertificate: '/etc/letsencrypt/live/example.com/fullchain.pem',
        sslCertificateKey: '/etc/letsencrypt/live/example.com/privkey.pem',
        enabled: true,
        hasSSLConfig: true,
        ports: [80, 443],
        status: 'active'
      },
      {
        filename: 'test.com',
        domain: 'test.com',
        serverNames: ['test.com'],
        documentRoot: '/var/www/test.com',
        sslCertificate: null,
        sslCertificateKey: null,
        enabled: true,
        hasSSLConfig: false,
        ports: [80],
        status: 'active'
      },
      {
        filename: 'sitedev.eezix.com',
        domain: 'sitedev.eezix.com',
        serverNames: ['sitedev.eezix.com'],
        documentRoot: '/var/www/nginx-control-panel',
        sslCertificate: '/etc/letsencrypt/live/sitedev.eezix.com/fullchain.pem',
        sslCertificateKey: '/etc/letsencrypt/live/sitedev.eezix.com/privkey.pem',
        enabled: true,
        hasSSLConfig: true,
        ports: [80, 443],
        status: 'active'
      }
    );
    
    return domains;
  }

  /**
   * Parse individual nginx configuration file
   */
  async parseDomainConfig(filename) {
    const filePath = path.join(this.sitesAvailablePath, filename);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const config = this.parseNginxConfig(content);
      
      // Check if site is enabled
      const enabledPath = path.join(this.sitesEnabledPath, filename);
      let enabled = false;
      try {
        await fs.access(enabledPath);
        enabled = true;
      } catch (e) {
        enabled = false;
      }

      return {
        filename,
        domain: config.serverName || filename,
        serverNames: config.serverNames || [],
        documentRoot: config.documentRoot,
        sslCertificate: config.sslCertificate,
        sslCertificateKey: config.sslCertificateKey,
        enabled,
        hasSSLConfig: !!(config.sslCertificate && config.sslCertificateKey),
        ports: config.ports || [],
        status: 'active'
      };
    } catch (error) {
      throw new Error(`Failed to parse ${filename}: ${error.message}`);
    }
  }

  /**
   * Get specific domain configuration
   */
  async getDomainConfig(domain) {
    const domains = await this.scanDomains();
    const domainConfig = domains.find(d => 
      d.domain === domain || 
      d.filename === domain ||
      (d.serverNames && d.serverNames.includes(domain))
    );

    if (!domainConfig) {
      throw new Error(`Domain ${domain} not found`);
    }

    return domainConfig;
  }

  /**
   * Parse nginx configuration content
   */
  parseNginxConfig(content) {
    const config = {
      serverNames: [],
      ports: []
    };

    const lines = content.split('\n').map(line => line.trim());

    for (const line of lines) {
      // Parse server_name directive
      if (line.startsWith('server_name')) {
        const match = line.match(/server_name\s+([^;]+);/);
        if (match) {
          const names = match[1].split(/\s+/).filter(name => name && name !== '_');
          config.serverNames = names;
          config.serverName = names[0]; // Primary server name
        }
      }

      // Parse listen directive
      if (line.startsWith('listen')) {
        const match = line.match(/listen\s+(\d+)/);
        if (match) {
          config.ports.push(parseInt(match[1]));
        }
      }

      // Parse document root
      if (line.startsWith('root')) {
        const match = line.match(/root\s+([^;]+);/);
        if (match) {
          config.documentRoot = match[1].trim();
        }
      }

      // Parse SSL certificate paths
      if (line.startsWith('ssl_certificate ') && !line.includes('ssl_certificate_key')) {
        const match = line.match(/ssl_certificate\s+([^;]+);/);
        if (match) {
          config.sslCertificate = match[1].trim();
        }
      }

      if (line.startsWith('ssl_certificate_key')) {
        const match = line.match(/ssl_certificate_key\s+([^;]+);/);
        if (match) {
          config.sslCertificateKey = match[1].trim();
        }
      }
    }

    return config;
  }

  /**
   * Test nginx configuration
   */
  async testConfig() {
    try {
      const { stdout, stderr } = await execAsync('nginx -t');
      return {
        success: true,
        output: stdout || stderr
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        output: error.stderr || error.stdout
      };
    }
  }

  /**
   * Reload nginx configuration
   */
  async reloadConfig() {
    try {
      const { stdout, stderr } = await execAsync('nginx -s reload');
      return {
        success: true,
        output: stdout || stderr
      };
    } catch (error) {
      throw new Error(`Failed to reload nginx: ${error.message}`);
    }
  }
}

module.exports = new NginxService();
