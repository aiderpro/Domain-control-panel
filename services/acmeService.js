const { execAsync } = require('./nginxService');
const fs = require('fs').promises;

class AcmeService {
  constructor() {
    this.acmePath = '/root/.acme.sh/acme.sh';
    this.certDir = '/etc/ssl/acme';
  }

  /**
   * Install acme.sh if not already installed
   */
  async ensureAcmeInstalled() {
    try {
      // Check if acme.sh exists at the expected path
      await execAsync(`test -f ${this.acmePath}`);
      return true;
    } catch (error) {
      console.log('Installing acme.sh...');
      try {
        await execAsync('curl https://get.acme.sh | sh -s email=admin@localhost');
        // Ensure the path exists after installation
        await execAsync(`test -f ${this.acmePath}`);
        return true;
      } catch (installError) {
        console.error('Failed to install acme.sh:', installError);
        return false;
      }
    }
  }

  /**
   * Configure CloudNS credentials for acme.sh
   */
  async setupCloudNSCredentials() {
    try {
      // Load CloudNS credentials
      const configPath = '.cloudns-config';
      const configContent = await fs.readFile(configPath, 'utf8');
      
      const config = {};
      configContent.split('\n').forEach(line => {
        if (line.trim() && !line.trim().startsWith('#')) {
          const [key, value] = line.split('=');
          if (key && value) {
            config[key.trim()] = value.trim();
          }
        }
      });

      if (!config.AUTH_ID && !config.SUB_AUTH_ID) {
        throw new Error('CloudNS credentials not found in .cloudns-config');
      }

      // Set CloudNS environment variables for acme.sh
      const authId = config.SUB_AUTH_ID || config.AUTH_ID;
      const authPassword = config.AUTH_PASSWORD;
      
      // Set environment variables properly for the current process
      process.env.CX_User = authId;
      process.env.CX_Key = authPassword;
      
      return true;
    } catch (error) {
      console.error('Failed to setup CloudNS credentials:', error);
      return false;
    }
  }

  /**
   * Issue SSL certificate using acme.sh with CloudNS DNS API
   */
  async issueCertificate(domains, email, io = null) {
    // Handle both single domain and array of domains
    const domainArray = Array.isArray(domains) ? domains : [domains];
    const primaryDomain = domainArray[0];
    return new Promise(async (resolve, reject) => {
      try {
        if (io) {
          io.emit('ssl_install_progress', {
            domain: primaryDomain,
            stage: 'acme_setup',
            message: 'Setting up acme.sh with CloudNS DNS API...'
          });
        }

        // Ensure acme.sh is installed
        const acmeInstalled = await this.ensureAcmeInstalled();
        if (!acmeInstalled) {
          throw new Error('Failed to install acme.sh');
        }

        // Setup CloudNS credentials
        const credentialsSetup = await this.setupCloudNSCredentials();
        if (!credentialsSetup) {
          throw new Error('Failed to setup CloudNS credentials');
        }

        if (io) {
          io.emit('ssl_install_progress', {
            domain: primaryDomain,
            stage: 'certificate_issue',
            message: `Issuing SSL certificate with DNS challenge for ${domainArray.join(', ')}...`
          });
        }

        // Create certificate directory
        await execAsync(`sudo mkdir -p ${this.certDir}/${primaryDomain}`);

        // Use a proper email format for Let's Encrypt registration
        const registrationEmail = email && email.includes('.') ? email : `admin@${primaryDomain}`;
        
        // Get CloudNS credentials from environment
        const authId = process.env.CX_User;
        const authPassword = process.env.CX_Key;
        
        // Build domain arguments for acme.sh
        const domainArgs = domainArray.map(d => `-d ${d}`).join(' ');
        
        // Issue certificate using CloudNS DNS API with environment variables and full path
        const acmeCommand = `CX_User="${authId}" CX_Key="${authPassword}" ${this.acmePath} --issue --dns dns_cx ${domainArgs} --accountemail ${registrationEmail} --cert-file ${this.certDir}/${primaryDomain}/cert.pem --key-file ${this.certDir}/${primaryDomain}/key.pem --fullchain-file ${this.certDir}/${primaryDomain}/fullchain.pem --reloadcmd "systemctl reload nginx" --debug`;

        const { stdout, stderr } = await execAsync(acmeCommand);
        
        if (io) {
          io.emit('ssl_install_progress', {
            domain: primaryDomain,
            stage: 'certificate_complete',
            message: 'SSL certificate issued successfully!'
          });
        }

        // Create symlinks to standard Let's Encrypt paths for compatibility
        await execAsync(`sudo mkdir -p /etc/letsencrypt/live/${primaryDomain}`);
        await execAsync(`sudo ln -sf ${this.certDir}/${primaryDomain}/fullchain.pem /etc/letsencrypt/live/${primaryDomain}/fullchain.pem`);
        await execAsync(`sudo ln -sf ${this.certDir}/${primaryDomain}/key.pem /etc/letsencrypt/live/${primaryDomain}/privkey.pem`);

        resolve({
          success: true,
          certificatePath: `/etc/letsencrypt/live/${primaryDomain}/fullchain.pem`,
          keyPath: `/etc/letsencrypt/live/${primaryDomain}/privkey.pem`,
          output: stdout
        });

      } catch (error) {
        console.error('ACME certificate issue failed:', error);
        
        if (io) {
          io.emit('ssl_install_progress', {
            domain: primaryDomain,
            stage: 'certificate_error',
            message: `Certificate issue failed: ${error.message}`
          });
        }

        reject(error);
      }
    });
  }

  /**
   * Renew certificate using acme.sh
   */
  async renewCertificate(domain, io = null) {
    try {
      if (io) {
        io.emit('ssl_install_progress', {
          domain,
          stage: 'certificate_renew',
          message: 'Renewing SSL certificate...'
        });
      }

      const renewCommand = `${this.acmePath} --renew -d ${domain} --force`;
      await execAsync(renewCommand);

      if (io) {
        io.emit('ssl_install_progress', {
          domain,
          stage: 'certificate_renewed',
          message: 'SSL certificate renewed successfully!'
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Certificate renewal failed:', error);
      throw error;
    }
  }

  /**
   * Setup automatic renewal cron job
   */
  async setupAutoRenewal() {
    try {
      // acme.sh automatically sets up cron job during installation
      // But we can verify and ensure it's working
      const cronCheck = await execAsync('crontab -l | grep acme.sh || echo "No acme.sh cron found"');
      console.log('ACME cron status:', cronCheck.stdout);
      
      return { success: true, message: 'Auto-renewal configured via acme.sh' };
    } catch (error) {
      console.error('Auto-renewal setup failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = AcmeService;