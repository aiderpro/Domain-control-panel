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
      throw new Error(`Failed to scan nginx domains: ${error.message}`);
    }
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
