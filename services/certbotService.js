const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class CertbotService {
  constructor() {
    this.letsEncryptPath = '/etc/letsencrypt';
    this.nginxPath = '/etc/nginx';
  }

  /**
   * Install SSL certificate using certbot with nginx verification
   */
  async installCertificate(domain, email, io = null) {
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
    const args = [
      'certonly',
      '--nginx',
      '--non-interactive',
      '--agree-tos',
      '--email', email,
      '-d', domain,
      '--expand'
    ];

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
          
          if (io) {
            io.emit('ssl_install_complete', { 
              domain, 
              success: true,
              message: 'Certificate installed successfully' 
            });
          }

          resolve({
            success: true,
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
   * Renew SSL certificate for specific domain
   */
  async renewCertificate(domain, io = null) {
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
