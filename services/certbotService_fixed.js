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
      return 'nginx'; // Default fallback
    }
  }

  /**
   * Install SSL certificate using specified method (nginx or dns)
   */
  async installCertificate(domain, email, method = 'nginx', io = null) {
    try {
      if (method === 'dns') {
        return await this.installCertificateWithDNS(domain, email, io);
      } else {
        return await this.installCertificateWithNginx(domain, email, io);
      }
    } catch (error) {
      console.error('Error in installCertificate:', error);
      if (io) {
        io.emit('ssl_install_error', { 
          domain, 
          error: `Installation failed: ${error.message}` 
        });
      }
      throw error;
    }
  }

  /**
   * Install SSL certificate using certbot with nginx verification
   */
  async installCertificateWithNginx(domain, email, io = null) {
    return new Promise((resolve, reject) => {
      try {
        if (!domain || !email) {
          return reject(new Error('Domain and email are required'));
        }

        // Include both domain and www subdomain
        const args = [
          'certonly',
          '--nginx',
          '--non-interactive',
          '--agree-tos',
          '--email', email,
          '-d', domain,
          '-d', `www.${domain}`
        ];

        // Check if certbot is available, if not simulate the process
        this.checkCertbotAvailability().then(availability => {
          if (!availability.available) {
            return this.simulateSSLInstallation(domain, email, io, resolve, reject);
          }

          // Continue with real certbot installation
          this.performRealSSLInstallation(domain, email, io, resolve, reject, args);
        }).catch(error => {
          console.error('Error checking certbot availability:', error);
          reject(new Error(`Failed to check certbot availability: ${error.message}`));
        });
      } catch (error) {
        console.error('Error in installCertificateWithNginx:', error);
        reject(new Error(`SSL installation failed: ${error.message}`));
      }
    });
  }

  /**
   * Simulate SSL installation for demo purposes
   */
  simulateSSLInstallation(domain, email, io, resolve, reject) {
    try {
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
            message: 'SSL certificate installed successfully (simulated)' 
          });
        }

        resolve({
          success: true,
          method: 'nginx',
          message: 'Certificate installed successfully (simulated)',
          output: 'Simulated SSL installation completed'
        });
      }, 3000);
    } catch (error) {
      console.error('Error in simulateSSLInstallation:', error);
      reject(new Error(`Simulation failed: ${error.message}`));
    }
  }

  /**
   * Perform real SSL installation with certbot
   */
  performRealSSLInstallation(domain, email, io, resolve, reject, args) {
    try {
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

      // Add error handler for spawn process
      certbot.on('error', (error) => {
        console.error('Certbot spawn error:', error);
        if (io) {
          io.emit('ssl_install_error', { 
            domain, 
            error: `Failed to start certbot: ${error.message}` 
          });
        }
        reject(new Error(`Failed to start certbot: ${error.message}`));
      });

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
        try {
          if (code === 0) {
            // Verify certificate was created
            const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
            await fs.access(certPath);

            // Verify nginx configuration was updated
            await this.verifyNginxSSLConfig(domain, io);

            // Test nginx configuration
            const testResult = spawn('nginx', ['-t']);

            testResult.on('close', (testCode) => {
              if (testCode === 0) {
                // Reload nginx to apply changes
                const reloadResult = spawn('nginx', ['-s', 'reload']);

                reloadResult.on('close', (reloadCode) => {
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
          } else {
            const error = `Certbot failed with exit code ${code}: ${errorOutput}`;
            if (io) {
              io.emit('ssl_install_error', { domain, error });
            }
            reject(new Error(error));
          }
        } catch (verifyError) {
          console.error('Certificate verification error:', verifyError);
          if (io) {
            io.emit('ssl_install_error', { 
              domain, 
              error: 'Certificate verification failed' 
            });
          }
          reject(new Error('Certificate installation failed verification'));
        }
      });

    } catch (error) {
      console.error('Error in performRealSSLInstallation:', error);
      if (io) {
        io.emit('ssl_install_error', { 
          domain, 
          error: `SSL installation error: ${error.message}` 
        });
      }
      reject(new Error(`SSL installation failed: ${error.message}`));
    }
  }

  /**
   * Install SSL certificate using DNS challenge with CloudNS
   */
  async installCertificateWithDNS(domain, email, io = null) {
    try {
      if (!this.cloudnsService) {
        throw new Error('CloudNS service not available');
      }

      return await this.cloudnsService.installSSLWithDNS(domain, email, io);
    } catch (error) {
      console.error('DNS SSL installation error:', error);
      if (io) {
        io.emit('ssl_install_error', { 
          domain, 
          error: error.message 
        });
      }
      throw error;
    }
  }

  /**
   * Renew SSL certificate for specific domain using saved method
   */
  async renewCertificate(domain, io = null) {
    try {
      const method = await this.getSSLMethod(domain);
      
      if (method === 'dns') {
        return await this.renewCertificateWithDNS(domain, io);
      } else {
        return await this.renewCertificateWithNginx(domain, io);
      }
    } catch (error) {
      console.error('Error renewing certificate:', error);
      if (io) {
        io.emit('ssl_renew_error', { 
          domain, 
          error: error.message 
        });
      }
      throw error;
    }
  }

  /**
   * Renew SSL certificate for specific domain using nginx method
   */
  async renewCertificateWithNginx(domain, io = null) {
    return new Promise((resolve, reject) => {
      try {
        if (io) {
          io.emit('ssl_renew_progress', { 
            domain, 
            stage: 'starting',
            message: 'Starting certificate renewal...' 
          });
        }

        const certbot = spawn('certbot', ['renew', '--cert-name', domain, '--nginx']);
        let output = '';
        let errorOutput = '';

        certbot.on('error', (error) => {
          console.error('Certbot renewal spawn error:', error);
          if (io) {
            io.emit('ssl_renew_error', { 
              domain, 
              error: `Failed to start certbot renewal: ${error.message}` 
            });
          }
          reject(new Error(`Failed to start certbot renewal: ${error.message}`));
        });

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

      } catch (error) {
        console.error('Error in renewCertificateWithNginx:', error);
        if (io) {
          io.emit('ssl_renew_error', { 
            domain, 
            error: `SSL renewal error: ${error.message}` 
          });
        }
        reject(new Error(`SSL renewal failed: ${error.message}`));
      }
    });
  }

  /**
   * Renew SSL certificate for specific domain using DNS method
   */
  async renewCertificateWithDNS(domain, io = null) {
    try {
      if (!this.cloudnsService) {
        throw new Error('CloudNS service not available');
      }

      // For DNS method renewals, use acme.sh renewal command
      if (io) {
        io.emit('ssl_renew_progress', { 
          domain, 
          stage: 'starting',
          message: 'Starting DNS certificate renewal...' 
        });
      }

      const result = await execAsync(`acme.sh --renew -d ${domain} -d www.${domain} --force`);
      
      if (io) {
        io.emit('ssl_renew_complete', { 
          domain, 
          success: true,
          message: 'DNS certificate renewed successfully' 
        });
      }

      return {
        success: true,
        method: 'dns',
        message: 'Certificate renewed successfully using DNS method',
        output: result.stdout
      };
    } catch (error) {
      console.error('DNS SSL renewal error:', error);
      if (io) {
        io.emit('ssl_renew_error', { 
          domain, 
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
    try {
      if (io) {
        io.emit('ssl_renew_all_progress', { 
          stage: 'starting',
          message: 'Starting renewal of all certificates...' 
        });
      }

      const result = await execAsync('certbot renew');
      
      if (io) {
        io.emit('ssl_renew_all_complete', { 
          success: true,
          message: 'All certificates renewed successfully' 
        });
      }

      return {
        success: true,
        message: 'All certificates renewed successfully',
        output: result.stdout
      };
    } catch (error) {
      console.error('Error renewing all certificates:', error);
      if (io) {
        io.emit('ssl_renew_all_error', { 
          error: error.message 
        });
      }
      throw error;
    }
  }

  /**
   * Check if certbot is installed and accessible
   */
  async checkCertbotAvailability() {
    try {
      await execAsync('certbot --version');
      return { available: true, message: 'Certbot is available' };
    } catch (error) {
      console.log('Certbot not available:', error.message);
      return { available: false, message: 'Certbot not installed or not accessible' };
    }
  }

  /**
   * Verify nginx SSL configuration was updated correctly
   */
  async verifyNginxSSLConfig(domain, io = null) {
    try {
      const configPath = `/etc/nginx/sites-available/${domain}`;
      const config = await fs.readFile(configPath, 'utf8');
      
      const hasSSLCert = config.includes('ssl_certificate');
      const hasSSLKey = config.includes('ssl_certificate_key');
      
      if (hasSSLCert && hasSSLKey) {
        if (io) {
          io.emit('ssl_install_progress', { 
            domain, 
            stage: 'progress',
            message: 'Nginx SSL configuration verified' 
          });
        }
        return true;
      } else {
        throw new Error('Nginx SSL configuration not properly updated');
      }
    } catch (error) {
      console.error('Error verifying nginx SSL config:', error);
      throw error;
    }
  }

  /**
   * Validate domain format
   */
  isValidDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    return domainRegex.test(domain);
  }

  /**
   * Validate email format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

module.exports = CertbotService;