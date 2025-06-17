const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class CloudNSService {
  constructor() {
    this.apiBaseUrl = 'https://api.cloudns.net';
    this.configFile = path.join(__dirname, '..', '.cloudns-config');
    this.credentials = null;
  }

  /**
   * Load CloudNS credentials from hidden config file
   */
  async loadCredentials() {
    try {
      const configData = await fs.readFile(this.configFile, 'utf8');
      this.credentials = JSON.parse(configData);
      return true;
    } catch (error) {
      // Config file doesn't exist or is invalid
      this.credentials = null;
      return false;
    }
  }

  /**
   * Check if CloudNS credentials are configured
   */
  async isConfigured() {
    await this.loadCredentials();
    return !!(this.credentials && this.credentials.authId && this.credentials.authPassword);
  }

  /**
   * Get authentication parameters for CloudNS API
   */
  async getAuthParams() {
    await this.loadCredentials();
    
    if (!this.credentials) {
      throw new Error('CloudNS credentials not configured');
    }
    
    const params = {};
    
    if (this.credentials.subAuthId) {
      params['sub-auth-id'] = this.credentials.subAuthId;
      params['auth-password'] = this.credentials.authPassword;
    } else {
      params['auth-id'] = this.credentials.authId;
      params['auth-password'] = this.credentials.authPassword;
    }
    
    return params;
  }

  /**
   * Create TXT record for DNS challenge
   */
  async createTxtRecord(domain, recordName, recordValue) {
    try {
      if (!(await this.isConfigured())) {
        throw new Error('CloudNS credentials not configured');
      }

      // Extract the zone from the domain
      const zone = this.extractZone(domain);
      
      const params = {
        ...(await this.getAuthParams()),
        'domain-name': zone,
        'record-type': 'TXT',
        'host': recordName.replace(`.${zone}`, ''),
        'record': recordValue,
        'ttl': 300
      };

      const response = await axios.post(`${this.apiBaseUrl}/dns/add-record.json`, null, {
        params: params
      });

      if (response.data.status === 'Success') {
        return {
          success: true,
          recordId: response.data.data.id,
          message: 'TXT record created successfully'
        };
      } else {
        throw new Error(response.data.statusDescription || 'Failed to create TXT record');
      }
    } catch (error) {
      console.error('Error creating CloudNS TXT record:', error);
      throw error;
    }
  }

  /**
   * Delete TXT record after DNS challenge
   */
  async deleteTxtRecord(domain, recordId) {
    try {
      if (!(await this.isConfigured())) {
        throw new Error('CloudNS credentials not configured');
      }

      const zone = this.extractZone(domain);
      
      const params = {
        ...(await this.getAuthParams()),
        'domain-name': zone,
        'record-id': recordId
      };

      const response = await axios.post(`${this.apiBaseUrl}/dns/delete-record.json`, null, {
        params: params
      });

      if (response.data.status === 'Success') {
        return {
          success: true,
          message: 'TXT record deleted successfully'
        };
      } else {
        throw new Error(response.data.statusDescription || 'Failed to delete TXT record');
      }
    } catch (error) {
      console.error('Error deleting CloudNS TXT record:', error);
      throw error;
    }
  }

  /**
   * Extract zone from domain (handles subdomains)
   */
  extractZone(domain) {
    const parts = domain.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return domain;
  }

  /**
   * Install SSL certificate using DNS challenge with CloudNS
   */
  async installSSLWithDNS(domain, email, io = null) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!(await this.isConfigured())) {
          throw new Error('CloudNS credentials not configured. Please create .cloudns-config file with your CloudNS API credentials.');
        }

        if (io) {
          io.emit('ssl_install_progress', {
            domain,
            stage: 'starting',
            message: 'Starting SSL installation with DNS challenge...'
          });
        }

        // Create DNS challenge hook script
        const hookScript = await this.createDNSHookScript();

        if (io) {
          io.emit('ssl_install_progress', {
            domain,
            stage: 'dns_challenge',
            message: 'Requesting certificate with DNS challenge...'
          });
        }

        // Run certbot with DNS challenge
        const certbotCmd = [
          'sudo', 'certbot', 'certonly',
          '--manual',
          '--preferred-challenges=dns',
          '--manual-auth-hook', hookScript,
          '--manual-cleanup-hook', hookScript,
          '--email', email,
          '--agree-tos',
          '--no-eff-email',
          '--domains', domain,
          '--non-interactive'
        ].join(' ');

        const { stdout, stderr } = await execAsync(certbotCmd);

        if (io) {
          io.emit('ssl_install_progress', {
            domain,
            stage: 'updating_nginx',
            message: 'Updating nginx configuration...'
          });
        }

        // Update nginx configuration to use the new certificate
        await this.updateNginxSSLConfig(domain);

        if (io) {
          io.emit('ssl_install_complete', {
            domain,
            method: 'dns',
            success: true,
            message: 'SSL certificate installed successfully using DNS method'
          });
        }

        resolve({
          success: true,
          method: 'dns',
          message: 'SSL certificate installed successfully using DNS method',
          output: stdout
        });

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
   * Create DNS hook script for certbot manual mode
   */
  async createDNSHookScript() {
    const hookScript = '/tmp/cloudns-hook.sh';
    
    const scriptContent = `#!/bin/bash

# CloudNS DNS Challenge Hook Script
DOMAIN="$CERTBOT_DOMAIN"
VALIDATION="$CERTBOT_VALIDATION"
TOKEN="$CERTBOT_TOKEN"

# CloudNS API credentials will be loaded from config
AUTH_ID="${this.credentials?.authId || ''}"
AUTH_PASSWORD="${this.credentials?.authPassword || ''}"
SUB_AUTH_ID="${this.credentials?.subAuthId || ''}"

# Determine record name for DNS challenge
RECORD_NAME="_acme-challenge"
if [ "$DOMAIN" != "$CERTBOT_DOMAIN" ]; then
    RECORD_NAME="_acme-challenge.$CERTBOT_DOMAIN"
fi

# Extract zone from domain
ZONE=$(echo "$DOMAIN" | sed 's/.*\\.\\([^.]*\\.[^.]*\\)$/\\1/')

# Set auth parameters
if [ -n "$SUB_AUTH_ID" ]; then
    AUTH_PARAMS="sub-auth-id=$SUB_AUTH_ID&auth-password=$AUTH_PASSWORD"
else
    AUTH_PARAMS="auth-id=$AUTH_ID&auth-password=$AUTH_PASSWORD"
fi

if [ "$1" = "cleanup" ]; then
    # Cleanup mode - delete the TXT record
    # This would require storing the record ID, for now we'll skip cleanup
    echo "Cleanup not implemented in this version"
else
    # Create TXT record
    curl -X POST "https://api.cloudns.net/dns/add-record.json" \\
        -d "$AUTH_PARAMS&domain-name=$ZONE&record-type=TXT&host=$RECORD_NAME&record=$VALIDATION&ttl=300"
    
    # Wait for DNS propagation
    echo "Waiting for DNS propagation..."
    sleep 30
fi
`;

    await require('fs').promises.writeFile(hookScript, scriptContent);
    await execAsync(`chmod +x ${hookScript}`);
    
    return hookScript;
  }

  /**
   * Update nginx configuration to use SSL certificate
   */
  async updateNginxSSLConfig(domain) {
    try {
      const nginxConfigPath = `/etc/nginx/sites-available/${domain}`;
      
      // Read current config
      const currentConfig = await require('fs').promises.readFile(nginxConfigPath, 'utf8');
      
      // Add SSL configuration
      const sslConfig = `
    # SSL Configuration added by SSL Manager
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
`;

      // Insert SSL config after the first server block opening
      const updatedConfig = currentConfig.replace(
        /server\s*{[^}]*listen\s+80;/,
        (match) => match + sslConfig
      );

      // Write updated config
      await require('fs').promises.writeFile(nginxConfigPath, updatedConfig);
      
      // Test and reload nginx
      await execAsync('sudo nginx -t');
      await execAsync('sudo systemctl reload nginx');
      
    } catch (error) {
      console.error('Error updating nginx SSL config:', error);
      throw error;
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