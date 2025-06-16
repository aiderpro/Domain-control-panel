const axios = require('axios');
const { execAsync } = require('./nginxService');

class CloudNSService {
  constructor() {
    this.apiBaseUrl = 'https://api.cloudns.net';
    this.credentials = null;
  }

  /**
   * Load CloudNS credentials from hidden config file
   */
  async loadCredentials() {
    try {
      const fs = require('fs').promises;
      const configPath = '.cloudns-config';
      
      try {
        await fs.access(configPath);
      } catch (error) {
        console.log('CloudNS config file not found at:', configPath);
        return null;
      }
      
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = {};
      
      configContent.split('\n').forEach(line => {
        // Skip comments and empty lines
        if (line.trim() && !line.trim().startsWith('#')) {
          const [key, value] = line.split('=');
          if (key && value) {
            config[key.trim()] = value.trim();
          }
        }
      });
      
      console.log('CloudNS config loaded. Found keys:', Object.keys(config));
      this.credentials = config;
      return config;
    } catch (error) {
      console.error('Error loading CloudNS credentials:', error);
      return null;
    }
  }

  /**
   * Check if CloudNS credentials are configured
   */
  async isConfigured() {
    if (!this.credentials) {
      await this.loadCredentials();
    }
    
    return this.credentials && 
           (this.credentials.AUTH_ID || this.credentials.SUB_AUTH_ID) && 
           this.credentials.AUTH_PASSWORD;
  }

  /**
   * Get authentication parameters for CloudNS API
   */
  async getAuthParams() {
    if (!this.credentials) {
      await this.loadCredentials();
    }
    
    if (!this.credentials) {
      throw new Error('CloudNS credentials not configured');
    }
    
    if (this.credentials.SUB_AUTH_ID) {
      return {
        'sub-auth-id': this.credentials.SUB_AUTH_ID,
        'auth-password': this.credentials.AUTH_PASSWORD
      };
    } else {
      return {
        'auth-id': this.credentials.AUTH_ID,
        'auth-password': this.credentials.AUTH_PASSWORD
      };
    }
  }

  /**
   * Create TXT record for DNS challenge
   */
  async createTxtRecord(domain, recordName, recordValue) {
    try {
      const zone = this.extractZone(domain);
      const params = {
        ...(await this.getAuthParams()),
        'domain-name': zone,
        'record-type': 'TXT',
        'host': recordName,
        'record': recordValue,
        'ttl': 300
      };

      const response = await axios.post(`${this.apiBaseUrl}/dns/add-record.json`, null, {
        params: params
      });

      return response.data;
    } catch (error) {
      console.error('Error creating TXT record:', error);
      throw error;
    }
  }

  /**
   * Delete TXT record after DNS challenge
   */
  async deleteTxtRecord(domain, recordId) {
    try {
      const zone = this.extractZone(domain);
      const params = {
        ...(await this.getAuthParams()),
        'domain-name': zone,
        'record-id': recordId
      };

      const response = await axios.post(`${this.apiBaseUrl}/dns/delete-record.json`, null, {
        params: params
      });

      return response.data;
    } catch (error) {
      console.error('Error deleting TXT record:', error);
      throw error;
    }
  }

  /**
   * Extract zone from domain (handles subdomains)
   */
  extractZone(domain) {
    const parts = domain.split('.');
    if (parts.length <= 2) {
      return domain;
    }
    
    // For subdomains, use the last two parts as the zone
    return parts.slice(-2).join('.');
  }

  /**
   * Install SSL certificate using DNS challenge with CloudNS
   */
  async installSSLWithDNS(domain, email, io = null) {
    return new Promise(async (resolve, reject) => {
      try {
        // Check if CloudNS credentials are configured
        if (!(await this.isConfigured())) {
          const error = 'CloudNS credentials not configured. Please create .cloudns-config file with AUTH_ID and AUTH_PASSWORD from your CloudNS account.';
          
          if (io) {
            io.emit('ssl_install_error', {
              domain,
              method: 'dns',
              error: error,
              setup_instructions: [
                '1. Go to CloudNS.net and log into your account',
                '2. Get your AUTH_ID and AUTH_PASSWORD from API settings',
                '3. Copy .cloudns-config.example to .cloudns-config',
                '4. Replace the placeholder values with your real credentials',
                '5. Make sure the file is in the project root directory'
              ]
            });
          }
          
          return reject(new Error(error));
        }

        if (io) {
          io.emit('ssl_install_progress', {
            domain,
            stage: 'starting',
            message: 'Starting SSL installation with DNS challenge...'
          });
        }

        // Test CloudNS connection first
        const connectionTest = await this.testConnection();
        if (!connectionTest.success) {
          const error = `CloudNS API connection failed: ${connectionTest.message}`;
          
          if (io) {
            io.emit('ssl_install_error', {
              domain,
              method: 'dns',
              error: error
            });
          }
          
          return reject(new Error(error));
        }

        if (io) {
          io.emit('ssl_install_progress', {
            domain,
            stage: 'dns_challenge',
            message: 'CloudNS connection verified. Starting DNS challenge...'
          });
        }

        // DNS method requires manual certificate creation with certbot
        const error = 'DNS SSL installation requires manual certificate creation with certbot. Use nginx method for automated installation, or run: sudo certbot certonly --manual --preferred-challenges=dns -d ' + domain;
        
        if (io) {
          io.emit('ssl_install_error', {
            domain,
            method: 'dns',
            error: error,
            manual_steps: [
              '1. Run: sudo certbot certonly --manual --preferred-challenges=dns -d ' + domain,
              '2. Follow prompts to create DNS TXT record in CloudNS',
              '3. Certificate will be created in /etc/letsencrypt/live/' + domain + '/',
              '4. Use nginx method for automated configuration updates'
            ]
          });
        }

        reject(new Error(error));

      } catch (error) {
        console.error('DNS SSL installation error:', error);
        
        if (io) {
          io.emit('ssl_install_error', {
            domain,
            method: 'dns',
            error: error.message
          });
        }

        reject(error);
      }
    });
  }

  /**
   * Create SSL certificate using DNS challenge
   */
  async createCertificateWithDNS(domain, email, io = null) {
    return new Promise((resolve, reject) => {
      if (io) {
        io.emit('ssl_install_progress', {
          domain,
          stage: 'certificate_creation',
          message: 'DNS method requires manual certificate creation. Simulating for demo...'
        });
      }

      // Note: Real DNS certificate creation would require:
      // 1. certbot certonly --manual --preferred-challenges=dns -d domain.com
      // 2. Manual DNS TXT record creation when prompted
      // 3. Certificate files created in /etc/letsencrypt/live/domain.com/
      
      // For demo purposes, we'll create placeholder certificate files
      setTimeout(async () => {
        try {
          const certDir = `/etc/letsencrypt/live/${domain}`;
          const placeholderCert = `# Placeholder certificate for ${domain}\n# In production, this would be a real Let's Encrypt certificate`;
          
          // Create certificate directory and placeholder files
          await execAsync(`sudo mkdir -p ${certDir}`);
          await execAsync(`echo '${placeholderCert}' | sudo tee ${certDir}/fullchain.pem`);
          await execAsync(`echo '${placeholderCert}' | sudo tee ${certDir}/privkey.pem`);
          await execAsync(`sudo chmod 644 ${certDir}/fullchain.pem ${certDir}/privkey.pem`);
          
          if (io) {
            io.emit('ssl_install_progress', {
              domain,
              stage: 'dns_verification',
              message: 'Demo certificate files created. In production, use real certbot with DNS challenge.'
            });
          }
          resolve();
        } catch (error) {
          if (io) {
            io.emit('ssl_install_progress', {
              domain,
              stage: 'certificate_error',
              message: `Certificate creation failed: ${error.message}`
            });
          }
          reject(error);
        }
      }, 2000);
    });
  }

  /**
   * Update nginx configuration to use SSL certificate
   */
  async updateNginxSSLConfig(domain) {
    try {
      const configPath = `/etc/nginx/sites-available/${domain}`;
      const nginxConfig = this.generateCompleteNginxConfig(domain);
      
      // Create escaped configuration for shell
      const escapedConfig = nginxConfig.replace(/'/g, "'\"'\"'");
      
      // Write the complete nginx configuration
      await execAsync(`echo '${escapedConfig}' | sudo tee ${configPath}`);
      
      // Enable the site if not already enabled
      await execAsync(`sudo ln -sf ${configPath} /etc/nginx/sites-enabled/${domain}`);
      
      return true;
    } catch (error) {
      console.error(`Error updating nginx config for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Generate complete nginx configuration with SSL
   */
  generateCompleteNginxConfig(domain) {
    return `# SSL-enabled configuration for ${domain}
# Generated by SSL Certificate Manager

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    
    server_name ${domain};
    root /var/www/html;
    index index.html index.htm index.php;
    
    # SSL Certificate paths
    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    
    # SSL Security settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    
    location / {
        try_files $uri $uri/ =404;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    return 301 https://$server_name$request_uri;
}`;
  }

  /**
   * Test nginx configuration and reload if valid
   */
  async testAndReloadNginx(domain, io = null) {
    try {
      // Test nginx configuration
      await execAsync('sudo nginx -t');
      
      if (io) {
        io.emit('ssl_install_progress', {
          domain,
          stage: 'nginx_reload',
          message: 'Nginx configuration valid. Reloading nginx...'
        });
      }
      
      // Reload nginx
      await execAsync('sudo systemctl reload nginx');
      
      return true;
    } catch (error) {
      console.error('Nginx test/reload failed:', error);
      
      if (io) {
        io.emit('ssl_install_progress', {
          domain,
          stage: 'nginx_error',
          message: `Nginx configuration error: ${error.message}`
        });
      }
      
      throw new Error(`Nginx configuration failed: ${error.message}`);
    }
  }

  /**
   * Test CloudNS API connection
   */
  async testConnection() {
    try {
      if (!(await this.isConfigured())) {
        return {
          success: false,
          message: 'CloudNS credentials not configured'
        };
      }

      const params = {
        ...(await this.getAuthParams())
      };

      const response = await axios.get(`${this.apiBaseUrl}/dns/login.json`, {
        params: params
      });

      if (response.data.status === 'Success') {
        return {
          success: true,
          message: 'CloudNS API connection successful'
        };
      } else {
        return {
          success: false,
          message: response.data.statusDescription || 'CloudNS API connection failed'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'CloudNS API connection error: ' + error.message
      };
    }
  }
}

module.exports = CloudNSService;