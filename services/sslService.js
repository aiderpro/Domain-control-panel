const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;

const execAsync = promisify(exec);

class SSLService {
  /**
   * Check SSL certificate status for a domain
   */
  async checkSSLStatus(domain) {
    try {
      // Try to get real SSL certificate information
      const realSSLData = await this.getRealSSLStatus(domain);
      if (realSSLData) {
        return realSSLData;
      }
    } catch (error) {
      console.log(`No real SSL certificate found for ${domain}, checking for certificate files...`);
    }
    
    // Check for Let's Encrypt or acme.sh certificate files
    try {
      const fileSSLData = await this.getSSLFromFiles(domain);
      if (fileSSLData) {
        return fileSSLData;
      }
    } catch (error) {
      console.log(`No certificate files found for ${domain}`);
    }
    
    // Return no SSL found
    return {
      status: 'no_ssl',
      hasSSL: false,
      domain,
      message: 'No SSL certificate found'
    };
  }

  /**
   * Get real SSL certificate information from live connection
   */
  async getRealSSLStatus(domain) {
    try {
      // Use openssl to check SSL certificate from live connection
      const command = `echo | openssl s_client -servername ${domain} -connect ${domain}:443 2>/dev/null | openssl x509 -noout -dates -subject -issuer -fingerprint`;
      const { stdout } = await execAsync(command);
      
      if (!stdout.trim()) {
        return null;
      }
      
      return this.parseSSLOutput(stdout, domain);
    } catch (error) {
      console.log(`Failed to get live SSL for ${domain}:`, error.message);
      return null;
    }
  }

  /**
   * Get SSL certificate information from certificate files
   */
  async getSSLFromFiles(domain) {
    const possiblePaths = [
      `/etc/letsencrypt/live/${domain}/fullchain.pem`,
      `/etc/ssl/acme/${domain}/fullchain.pem`,
      `/root/.acme.sh/${domain}/fullchain.cer`,
      `/etc/ssl/certs/${domain}.pem`
    ];

    for (const certPath of possiblePaths) {
      try {
        await fs.access(certPath);
        const command = `openssl x509 -in ${certPath} -noout -dates -subject -issuer -fingerprint`;
        const { stdout } = await execAsync(command);
        
        if (stdout.trim()) {
          return this.parseSSLOutput(stdout, domain, certPath);
        }
      } catch (error) {
        // Continue to next path
      }
    }
    
    return null;
  }

  /**
   * Parse SSL certificate output from openssl command
   */
  parseSSLOutput(output, domain, certificatePath = null) {
    const lines = output.split('\n');
    let notBefore = null;
    let notAfter = null;
    let subject = '';
    let issuer = '';
    let fingerprint = '';

    for (const line of lines) {
      if (line.startsWith('notBefore=')) {
        notBefore = new Date(line.replace('notBefore=', ''));
      } else if (line.startsWith('notAfter=')) {
        notAfter = new Date(line.replace('notAfter=', ''));
      } else if (line.startsWith('subject=')) {
        subject = line.replace('subject=', '');
      } else if (line.startsWith('issuer=')) {
        issuer = line.replace('issuer=', '');
      } else if (line.startsWith('SHA1 Fingerprint=')) {
        fingerprint = line.replace('SHA1 Fingerprint=', '');
      }
    }

    if (!notAfter) {
      return null;
    }

    const now = new Date();
    
    // Set both dates to start of day for accurate day calculation
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expiryDate = new Date(notAfter.getFullYear(), notAfter.getMonth(), notAfter.getDate());
    
    // Certbot-style calculation: count full days remaining excluding today
    const daysUntilExpiry = Math.floor((expiryDate - nowDate) / (1000 * 60 * 60 * 24)) - 1;
    const isExpired = daysUntilExpiry < 0;
    const isExpiringSoon = daysUntilExpiry <= 30 && !isExpired;

    // Extract issuer organization
    const issuerMatch = issuer.match(/O=([^,]+)/);
    const issuerOrg = issuerMatch ? issuerMatch[1] : 'Unknown';

    return {
      status: isExpired ? 'expired' : 'active',
      hasSSL: true,
      domain,
      issuedDate: notBefore,
      expiryDate: notAfter,
      validFrom: notBefore?.toISOString(),
      daysUntilExpiry,
      isExpiringSoon,
      isExpired,
      commonName: domain,
      subject,
      issuer,
      issuerOrg,
      fingerprint,
      certificatePath
    };
  }

  /**
   * Get demo SSL status for testing
   */
  getDemoSSLStatus(domain) {
    // Static demo data for specific domains
    const specificData = {
      'example.com': {
        status: 'active',
        hasSSL: true,
        domain,
        issuedDate: new Date('2024-01-15'),
        expiryDate: new Date('2024-04-15'),
        daysUntilExpiry: 60,
        isExpiringSoon: true,
        isExpired: false,
        commonName: 'example.com',
        issuer: 'CN=R3, O=Let\'s Encrypt, C=US',
        issuerOrg: 'Let\'s Encrypt',
        fingerprint: '12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78'
      },
      'test.com': {
        status: 'no_ssl',
        hasSSL: false,
        domain,
        message: 'No SSL certificate found'
      },
      'sitedev.eezix.com': {
        status: 'active',
        hasSSL: true,
        domain,
        issuedDate: new Date('2024-12-01'),
        expiryDate: new Date('2025-03-01'),
        daysUntilExpiry: 75,
        isExpiringSoon: false,
        isExpired: false,
        commonName: 'sitedev.eezix.com',
        issuer: 'CN=R3, O=Let\'s Encrypt, C=US',
        issuerOrg: 'Let\'s Encrypt',
        fingerprint: 'AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12'
      }
    };

    if (specificData[domain]) {
      return specificData[domain];
    }

    // Generate dynamic SSL status for demo domains based on domain pattern
    const domainNumber = domain.match(/domain(\d+)/);
    if (domainNumber) {
      const num = parseInt(domainNumber[1]);
      const hasSSL = num % 4 !== 0; // 75% have SSL (matching nginx service)
      
      if (!hasSSL) {
        return {
          status: 'no_ssl',
          hasSSL: false,
          domain,
          message: 'No SSL certificate found'
        };
      }

      const isExpired = num % 15 === 0; // Some are expired
      const isExpiring = !isExpired && num % 7 === 0; // Some are expiring
      
      const now = new Date();
      const issuedDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000)); // 90 days ago
      let expiryDate, daysUntilExpiry;
      
      if (isExpired) {
        expiryDate = new Date(now.getTime() - (5 * 24 * 60 * 60 * 1000)); // Expired 5 days ago
        daysUntilExpiry = -5;
      } else if (isExpiring) {
        expiryDate = new Date(now.getTime() + (15 * 24 * 60 * 60 * 1000)); // Expires in 15 days
        daysUntilExpiry = 15;
      } else {
        expiryDate = new Date(now.getTime() + (60 * 24 * 60 * 60 * 1000)); // Expires in 60 days
        daysUntilExpiry = 60;
      }

      return {
        status: 'active',
        hasSSL: true,
        domain,
        issuedDate,
        expiryDate,
        daysUntilExpiry,
        isExpiringSoon: isExpiring,
        isExpired: isExpired,
        commonName: domain,
        issuer: 'CN=R3, O=Let\'s Encrypt, C=US',
        issuerOrg: 'Let\'s Encrypt',
        fingerprint: `${num.toString(16).padStart(2, '0')}:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78`
      };
    }

    // Default for unknown domains
    return {
      status: 'no_ssl',
      hasSSL: false,
      domain,
      message: 'No SSL certificate found'
    };
  }

  /**
   * Check if domain has HTTPS connection
   */
  async checkHTTPSConnection(domain) {
    try {
      const command = `timeout 10 openssl s_client -connect ${domain}:443 -servername ${domain} </dev/null 2>/dev/null | openssl x509 -noout -text 2>/dev/null`;
      const { stdout } = await execAsync(command);
      
      return {
        hasSSL: stdout.length > 0,
        connected: true
      };
    } catch (error) {
      return {
        hasSSL: false,
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Get detailed certificate information
   */
  async getCertificateDetails(domain) {
    try {
      // Get certificate details
      const certCommand = `echo | timeout 10 openssl s_client -servername ${domain} -connect ${domain}:443 2>/dev/null | openssl x509 -noout -dates -subject -issuer -fingerprint`;
      const { stdout } = await execAsync(certCommand);

      const details = this.parseCertificateOutput(stdout);
      
      // Calculate days until expiry
      if (details.expiryDate) {
        const now = new Date();
        const expiry = new Date(details.expiryDate);
        details.daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        details.isExpiringSoon = details.daysUntilExpiry <= 30;
        details.isExpired = details.daysUntilExpiry <= 0;
      }

      return details;
    } catch (error) {
      throw new Error(`Failed to get certificate details: ${error.message}`);
    }
  }

  /**
   * Parse OpenSSL certificate output
   */
  parseCertificateOutput(output) {
    const details = {};
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.startsWith('notBefore=')) {
        details.issuedDate = new Date(line.replace('notBefore=', ''));
      }
      
      if (line.startsWith('notAfter=')) {
        details.expiryDate = new Date(line.replace('notAfter=', ''));
      }
      
      if (line.startsWith('subject=')) {
        details.subject = line.replace('subject=', '');
        
        // Extract common name
        const cnMatch = details.subject.match(/CN\s*=\s*([^,]+)/);
        if (cnMatch) {
          details.commonName = cnMatch[1].trim();
        }
      }
      
      if (line.startsWith('issuer=')) {
        details.issuer = line.replace('issuer=', '');
        
        // Extract issuer organization
        const orgMatch = details.issuer.match(/O\s*=\s*([^,]+)/);
        if (orgMatch) {
          details.issuerOrg = orgMatch[1].trim();
        }
      }
      
      if (line.startsWith('SHA1 Fingerprint=')) {
        details.fingerprint = line.replace('SHA1 Fingerprint=', '');
      }
    }

    return details;
  }

  /**
   * Check if Let's Encrypt certificate exists for domain
   */
  async checkLetsEncryptCert(domain) {
    try {
      const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
      const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;

      await fs.access(certPath);
      await fs.access(keyPath);

      // Get certificate details from file
      const certCommand = `openssl x509 -in ${certPath} -noout -dates -subject -issuer`;
      const { stdout } = await execAsync(certCommand);
      
      const details = this.parseCertificateOutput(stdout);
      
      return {
        exists: true,
        certPath,
        keyPath,
        ...details
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message
      };
    }
  }

  /**
   * Get SSL certificate expiry dates for multiple domains
   */
  async checkMultipleSSLStatus(domains) {
    const results = {};
    
    await Promise.all(
      domains.map(async (domain) => {
        try {
          results[domain] = await this.checkSSLStatus(domain);
        } catch (error) {
          results[domain] = {
            status: 'error',
            hasSSL: false,
            domain,
            error: error.message
          };
        }
      })
    );

    return results;
  }

  /**
   * Validate SSL certificate chain
   */
  async validateCertificateChain(domain) {
    try {
      const command = `echo | timeout 10 openssl s_client -servername ${domain} -connect ${domain}:443 -verify_return_error 2>&1`;
      const { stdout, stderr } = await execAsync(command);
      
      const output = stdout + stderr;
      
      return {
        valid: !output.includes('verify error') && output.includes('Verification: OK'),
        output: output,
        errors: output.includes('verify error') ? 
          output.split('\n').filter(line => line.includes('verify error')) : []
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = new SSLService();
