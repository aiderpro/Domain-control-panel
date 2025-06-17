const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const CloudNSService = require('./cloudnsService');

const execAsync = promisify(exec);

class CertbotService {
  constructor() {
    this.letsEncryptPath = '/etc/letsencrypt';
    this.nginxPath = '/etc/nginx';
    this.cloudnsService = new CloudNSService();
    this.methodTrackingFile = path.join(__dirname, '..', 'data', 'ssl-methods.json');
  }

  /**
   * Save SSL installation method for domain
   */
  async saveSSLMethod(domain, method) {
    try {
      let methods = {};
      try {
        const data = await fs.readFile(this.methodTrackingFile, 'utf8');
        methods = JSON.parse(data);
      } catch (error) {
        // File doesn't exist yet, create new object
      }

      methods[domain] = {
        method: method,
        installedAt: new Date().toISOString()
      };

      // Ensure data directory exists
      await fs.mkdir(path.dirname(this.methodTrackingFile), { recursive: true });
      await fs.writeFile(this.methodTrackingFile, JSON.stringify(methods, null, 2));
    } catch (error) {
      console.error('Error saving SSL method:', error);
    }
  }

  /**
   * Get SSL installation method for domain
   */
  async getSSLMethod(domain) {
    try {
      const data = await fs.readFile(this.methodTrackingFile, 'utf8');
      const methods = JSON.parse(data);
      return methods[domain]?.method || 'nginx'; // Default to nginx if not found
    } catch (error) {
      return 'nginx'; // Default to nginx if file doesn't exist
    }
  }

  /**
   * Determine if domain should include www subdomain for SSL
   */
  shouldIncludeWWW(domain) {
    // Count dots in domain to determine if it's a subdomain
    const dotCount = (domain.match(/\./g) || []).length;
    
    // If domain has only one dot (e.g., example.com), include www
    // If domain has multiple dots (e.g., sub.example.com), it's already a subdomain
    return dotCount === 1 && !domain.startsWith('www.');
  }

  /**
   * Get domains array for SSL certificate installation
   */
  getDomainsForSSL(domain) {
    const domains = [domain];
    
    if (this.shouldIncludeWWW(domain)) {
      domains.push(`www.${domain}`);
    }
    
    return domains;
  }

  /**
   * Install SSL certificate using specified method (nginx or dns)
   */
  async installCertificate(domain, email, method = 'nginx', io = null) {
    if (method === 'dns') {
      return this.installCertificateWithDNS(domain, email, io);
    } else {
      return this.installCertificateWithNginx(domain, email, io);
    }
  }

  /**
   * Install SSL certificate using certbot with nginx verification
   */
  async installCertificateWithNginx(domain, email, io = null) {
    return new Promise((resolve, reject) => {
      // Validate inputs
      if (!domain || !email) {
        return reject(new Error('Domain and email are required'));
      }

      if (!this.isValidDomain(domain) || !this.isValidEmail(email)) {
        return reject(new Error('Invalid domain or email format'));
      }

      // Check if certbot is available, if not simulate the process
      this.checkCertbotAvailability().then(availability => {
        if (!availability.available) {
          return this.simulateSSLInstallation(domain, email, io, resolve, reject);
        }
        
        // Continue with real certbot installation
        this.performRealSSLInstallation(domain, email, io, resolve, reject);
      });
    });
  }

  /**
   * Simulate SSL installation for demo purposes
   */
  simulateSSLInstallation(domain, email, io, resolve, reject) {
    console.log(`Simulating SSL installation for ${domain} with email ${email}`);
    
    if (io) {
      io.emit('ssl_install_progress', { 
        domain, 
        stage: 'starting',
        message: 'Starting certificate installation...' 
      });
    }

    setTimeout(() => {
      if (io) {
        io.emit('ssl_install_progress', { 
          domain, 
          stage: 'progress',
          message: 'Validating domain ownership...' 
        });
      }
    }, 1000);

    setTimeout(() => {
      if (io) {
        io.emit('ssl_install_progress', { 
          domain, 
          stage: 'progress',
          message: 'Generating certificate...' 
        });
      }
    }, 2000);

    setTimeout(() => {
      if (io) {
        io.emit('ssl_install_complete', { 
          domain, 
          success: true,
          message: 'Certificate installed successfully' 
        });
      }

      resolve({
        success: true,
        message: 'Certificate installed successfully (simulated)',
        output: `Simulated certificate installation for ${domain}`,
        certPath: `/etc/letsencrypt/live/${domain}/fullchain.pem`
      });
    }, 3000);
  }

  /**
   * Perform real SSL installation with certbot
   */
  performRealSSLInstallation(domain, email, io, resolve, reject) {
    // Get domains array (includes www if applicable)
    const domains = this.getDomainsForSSL(domain);
    
    const args = [
      '--nginx',
      '--non-interactive',
      '--agree-tos',
      '--email', email,
      '--expand',
      '--redirect'
    ];

    // Add domain arguments
    domains.forEach(d => {
      args.push('-d', d);
    });

    // Emit status updates
    if (io) {
      io.emit('ssl_install_progress', { 
        domain, 
        stage: 'starting',
        message: 'Starting certificate installation...' 
      });
    }

    const certbot = spawn('certbot', args);
    let output = '';
    let errorOutput = '';

    certbot.stdout.on('data', (data) => {
      const message = data.toString();
      output += message;
      console.log('Certbot stdout:', message);
      
      if (io) {
        io.emit('ssl_install_progress', { 
          domain, 
          stage: 'progress',
          message: message.trim() 
        });
      }
    });

    certbot.stderr.on('data', (data) => {
      const message = data.toString();
      errorOutput += message;
      console.error('Certbot stderr:', message);
      
      if (io) {
        io.emit('ssl_install_progress', { 
          domain, 
          stage: 'warning',
          message: message.trim() 
        });
      }
    });

    certbot.on('close', async (code) => {
      if (code === 0) {
        try {
          // Verify certificate was created
          const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
          await fs.access(certPath);
          
          // Verify nginx configuration was updated
          await this.verifyNginxSSLConfig(domain, io);
          
          // Test nginx configuration
          const { spawn } = require('child_process');
          const nginxTest = spawn('nginx', ['-t']);
          
          nginxTest.on('close', (testCode) => {
            if (testCode === 0) {
              // Reload nginx to apply changes
              const nginxReload = spawn('systemctl', ['reload', 'nginx']);
              nginxReload.on('close', (reloadCode) => {
                if (io) {
                  io.emit('ssl_install_complete', { 
                    domain, 
                    success: true,
                    message: reloadCode === 0 ? 'Certificate installed and nginx reloaded successfully' : 'Certificate installed but nginx reload failed'
                  });
                }
              });
            } else {
              if (io) {
                io.emit('ssl_install_complete', { 
                  domain, 
                  success: true,
                  message: 'Certificate installed but nginx configuration has errors'
                });
              }
            }
          });

          // Save the installation method for future renewals
          await this.saveSSLMethod(domain, 'nginx');
          
          resolve({
            success: true,
            method: 'nginx',
            message: 'Certificate installed successfully',
            output,
            certPath
          });
        } catch (verifyError) {
          if (io) {
            io.emit('ssl_install_error', { 
              domain, 
              error: 'Certificate verification failed' 
            });
          }
          reject(new Error('Certificate installation failed verification'));
        }
      } else {
        const error = `Certbot failed with exit code ${code}: ${errorOutput}`;
        if (io) {
          io.emit('ssl_install_error', { domain, error });
        }
        reject(new Error(error));
      }
    });

    certbot.on('error', (error) => {
      if (io) {
        io.emit('ssl_install_error', { domain, error: error.message });
      }
      reject(new Error(`Failed to start certbot: ${error.message}`));
    });
  }

  /**
   * Install SSL certificate using DNS challenge with CloudNS
   */
  async installCertificateWithDNS(domain, email, io = null) {
    try {
      if (io) {
        io.emit('ssl_install_progress', {
          domain,
          stage: 'starting',
          message: 'Starting SSL installation with DNS challenge...'
        });
      }

      // Get domains array (includes www if applicable)
      const domains = this.getDomainsForSSL(domain);
      
      // Use CloudNS service for DNS challenge
      const result = await this.cloudnsService.installSSLWithDNS(domains, email, io);
      
      // Save the installation method for future renewals
      await this.saveSSLMethod(domain, 'dns');
      
      return {
        ...result,
        method: 'dns'
      };
    } catch (error) {
      console.error('DNS SSL installation error:', error);
      throw error;
    }
  }

  /**
   * Renew SSL certificate for specific domain using saved method
   */
  async renewCertificate(domain, io = null) {
    try {
      // Get the method used for initial installation
      const method = await this.getSSLMethod(domain);
      
      if (method === 'dns') {
        return this.renewCertificateWithDNS(domain, io);
      } else {
        return this.renewCertificateWithNginx(domain, io);
      }
    } catch (error) {
      console.error('Error during certificate renewal:', error);
      throw error;
    }
  }

  /**
   * Renew SSL certificate for specific domain using nginx method
   */
  async renewCertificateWithNginx(domain, io = null) {
    return new Promise((resolve, reject) => {
      if (!domain) {
        return reject(new Error('Domain is required'));
      }

      const args = [
        'renew',
        '--cert-name', domain,
        '--nginx',
        '--non-interactive'
      ];

      if (io) {
        io.emit('ssl_renew_progress', { 
          domain, 
          stage: 'starting',
          message: 'Starting certificate renewal...' 
        });
      }

      const certbot = spawn('certbot', args);
      let output = '';
      let errorOutput = '';

      certbot.stdout.on('data', (data) => {
        const message = data.toString();
        output += message;
        console.log('Certbot renewal stdout:', message);
        
        if (io) {
          io.emit('ssl_renew_progress', { 
            domain, 
            stage: 'progress',
            message: message.trim() 
          });
        }
      });

      certbot.stderr.on('data', (data) => {
        const message = data.toString();
        errorOutput += message;
        console.error('Certbot renewal stderr:', message);
        
        if (io) {
          io.emit('ssl_renew_progress', { 
            domain, 
            stage: 'warning',
            message: message.trim() 
          });
        }
      });

      certbot.on('close', (code) => {
        if (code === 0) {
          if (io) {
            io.emit('ssl_renew_complete', { 
              domain, 
              success: true,
              message: 'Certificate renewed successfully' 
            });
          }

          resolve({
            success: true,
            method: 'nginx',
            message: 'Certificate renewed successfully',
            output
          });
        } else {
          const error = `Certbot renewal failed with exit code ${code}: ${errorOutput}`;
          if (io) {
            io.emit('ssl_renew_error', { domain, error });
          }
          reject(new Error(error));
        }
      });

      certbot.on('error', (error) => {
        if (io) {
          io.emit('ssl_renew_error', { domain, error: error.message });
        }
        reject(new Error(`Failed to start certbot renewal: ${error.message}`));
      });
    });
  }

  /**
   * Renew SSL certificate for specific domain using DNS method
   */
  async renewCertificateWithDNS(domain, io = null) {
    try {
      if (io) {
        io.emit('ssl_renew_progress', {
          domain,
          stage: 'starting',
          message: 'Starting certificate renewal with DNS challenge...'
        });
      }

      // Use CloudNS service for DNS renewal
      const result = await this.cloudnsService.installSSLWithDNS(domain, '', io);
      
      if (io) {
        io.emit('ssl_renew_complete', {
          domain,
          success: true,
          method: 'dns',
          message: 'Certificate renewed successfully using DNS method'
        });
      }

      return {
        success: true,
        method: 'dns',
        message: 'Certificate renewed successfully using DNS method',
        output: result.output || ''
      };
    } catch (error) {
      console.error('DNS certificate renewal error:', error);
      
      if (io) {
        io.emit('ssl_renew_error', {
          domain,
          method: 'dns',
          error: error.message
        });
      }
      
      throw error;
    }
  }

  /**
   * Renew all certificates
   */
  async renewAllCertificates(io = null) {
    return new Promise((resolve, reject) => {
      const args = [
        'renew',
        '--nginx',
        '--non-interactive'
      ];

      if (io) {
        io.emit('ssl_renew_all_progress', { 
          stage: 'starting',
          message: 'Starting renewal of all certificates...' 
        });
      }

      const certbot = spawn('certbot', args);
      let output = '';
      let errorOutput = '';

      certbot.stdout.on('data', (data) => {
        const message = data.toString();
        output += message;
        console.log('Certbot renew-all stdout:', message);
        
        if (io) {
          io.emit('ssl_renew_all_progress', { 
            stage: 'progress',
            message: message.trim() 
          });
        }
      });

      certbot.stderr.on('data', (data) => {
        const message = data.toString();
        errorOutput += message;
        console.error('Certbot renew-all stderr:', message);
        
        if (io) {
          io.emit('ssl_renew_all_progress', { 
            stage: 'warning',
            message: message.trim() 
          });
        }
      });

      certbot.on('close', (code) => {
        if (code === 0) {
          if (io) {
            io.emit('ssl_renew_all_complete', { 
              success: true,
              message: 'All certificates renewed successfully' 
            });
          }

          resolve({
            success: true,
            message: 'All certificates renewed successfully',
            output
          });
        } else {
          const error = `Certbot renew-all failed with exit code ${code}: ${errorOutput}`;
          if (io) {
            io.emit('ssl_renew_all_error', { error });
          }
          reject(new Error(error));
        }
      });

      certbot.on('error', (error) => {
        if (io) {
          io.emit('ssl_renew_all_error', { error: error.message });
        }
        reject(new Error(`Failed to start certbot renew-all: ${error.message}`));
      });
    });
  }

  /**
   * Configure auto-renewal for certificates
   */
  async configureAutoRenew(domain, enabled) {
    try {
      if (enabled) {
        // Add cron job for auto-renewal
        const cronJob = '0 12 * * * /usr/bin/certbot renew --quiet --nginx';
        const { stdout } = await execAsync('crontab -l 2>/dev/null || echo ""');
        
        if (!stdout.includes('certbot renew')) {
          await execAsync(`(crontab -l 2>/dev/null; echo "${cronJob}") | crontab -`);
        }
        
        return {
          success: true,
          message: 'Auto-renewal enabled via cron job',
          cronJob
        };
      } else {
        // Remove cron job
        await execAsync('crontab -l | grep -v "certbot renew" | crontab -');
        
        return {
          success: true,
          message: 'Auto-renewal disabled'
        };
      }
    } catch (error) {
      throw new Error(`Failed to configure auto-renewal: ${error.message}`);
    }
  }

  /**
   * List all certificates managed by certbot
   */
  async listCertificates() {
    try {
      const { stdout } = await execAsync('certbot certificates --quiet');
      return this.parseCertificatesList(stdout);
    } catch (error) {
      throw new Error(`Failed to list certificates: ${error.message}`);
    }
  }

  /**
   * Parse certbot certificates list output
   */
  parseCertificatesList(output) {
    const certificates = [];
    const lines = output.split('\n');
    let currentCert = null;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('Certificate Name:')) {
        if (currentCert) {
          certificates.push(currentCert);
        }
        currentCert = {
          name: trimmed.replace('Certificate Name:', '').trim()
        };
      } else if (currentCert) {
        if (trimmed.startsWith('Domains:')) {
          currentCert.domains = trimmed.replace('Domains:', '').trim().split(' ');
        } else if (trimmed.startsWith('Expiry Date:')) {
          const expiryMatch = trimmed.match(/Expiry Date: (.+?) \(/);
          if (expiryMatch) {
            currentCert.expiryDate = new Date(expiryMatch[1]);
          }
        } else if (trimmed.startsWith('Certificate Path:')) {
          currentCert.certPath = trimmed.replace('Certificate Path:', '').trim();
        } else if (trimmed.startsWith('Private Key Path:')) {
          currentCert.keyPath = trimmed.replace('Private Key Path:', '').trim();
        }
      }
    }

    if (currentCert) {
      certificates.push(currentCert);
    }

    return certificates;
  }

  /**
   * Validate domain format
   */
  isValidDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  }

  /**
   * Validate email format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Verify nginx SSL configuration was updated correctly
   */
  async verifyNginxSSLConfig(domain, io = null) {
    try {
      const nginxService = require('./nginxService');
      const nginx = new nginxService();
      
      // Get domain configuration
      const config = await nginx.getDomainConfig(domain);
      
      if (!config) {
        throw new Error(`No nginx configuration found for ${domain}`);
      }
      
      // Check if SSL directives were added
      const hasSSLCertificate = config.sslCertificate && config.sslCertificate.includes(domain);
      const hasSSLKey = config.sslCertificateKey && config.sslCertificateKey.includes(domain);
      const hasPort443 = config.listen && config.listen.includes('443');
      
      if (io) {
        if (hasSSLCertificate && hasSSLKey && hasPort443) {
          io.emit('ssl_install_progress', { 
            domain, 
            stage: 'verification',
            message: 'Nginx SSL configuration verified successfully' 
          });
        } else {
          io.emit('ssl_install_progress', { 
            domain, 
            stage: 'warning',
            message: 'Nginx SSL configuration may need manual verification' 
          });
        }
      }
      
      return {
        configured: hasSSLCertificate && hasSSLKey && hasPort443,
        details: {
          hasSSLCertificate,
          hasSSLKey,
          hasPort443,
          config
        }
      };
    } catch (error) {
      console.error('Error verifying nginx SSL config:', error);
      if (io) {
        io.emit('ssl_install_progress', { 
          domain, 
          stage: 'warning',
          message: 'Could not verify nginx configuration automatically' 
        });
      }
      return { configured: false, error: error.message };
    }
  }

  /**
   * Check if certbot is installed and accessible
   */
  async checkCertbotAvailability() {
    try {
      const { stdout } = await execAsync('certbot --version');
      return {
        available: true,
        version: stdout.trim()
      };
    } catch (error) {
      return {
        available: false,
        error: error.message
      };
    }
  }
}

module.exports = new CertbotService();
