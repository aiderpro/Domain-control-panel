const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;

const execAsync = promisify(exec);

class SSLService {
  constructor() {
    this.sslCache = new Map(); // Cache SSL results to prevent fluctuations
    this.cacheTimeout = 60000; // 1 minute cache for more frequent updates
    this.lastCacheClear = Date.now();
  }

  /**
   * Check SSL certificate status with forced refresh option for accurate statistics
   */
  async checkSSLStatus(domain, forceRefresh = false) {
    // Force refresh bypasses cache for accurate real-time data
    if (!forceRefresh) {
      const cached = this.sslCache.get(domain);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        return cached.data;
      }
    }

    console.log(`Checking SSL status for ${domain}${forceRefresh ? ' (forced refresh)' : ''}...`);
    
    // Method 1: Check certificate files first (most accurate for installed certificates)
    try {
      const fileSSLData = await this.getSSLFromFiles(domain);
      if (fileSSLData && fileSSLData.hasSSL) {
        console.log(`File SSL found for ${domain}: expires ${fileSSLData.expiryDate}, ${fileSSLData.daysUntilExpiry} days remaining`);
        this.cacheSSLResult(domain, fileSSLData);
        return fileSSLData;
      }
    } catch (error) {
      console.log(`File SSL check failed for ${domain}:`, error.message);
    }

    // Method 2: Check for domain without www prefix (common SSL setup)
    if (domain.startsWith('www.')) {
      try {
        const baseDomain = domain.replace('www.', '');
        const noDomainData = await this.getSSLFromFiles(baseDomain);
        if (noDomainData && noDomainData.hasSSL) {
          console.log(`File SSL found for ${domain} via base domain ${baseDomain}`);
          const result = { ...noDomainData, domain };
          this.cacheSSLResult(domain, result);
          return result;
        }
      } catch (error) {
        console.log(`Base domain SSL check failed for ${domain}:`, error.message);
      }
    }

    // Method 2: Live SSL connection with timeout protection
    try {
      const liveSSLData = await this.getLiveSSLStatusWithTimeout(domain, 5000);
      if (liveSSLData && liveSSLData.hasSSL) {
        console.log(`AUTHENTIC SSL found for ${domain}: expires ${liveSSLData.expiryDate}, ${liveSSLData.daysUntilExpiry} days remaining`);
        this.cacheSSLResult(domain, liveSSLData);
        return liveSSLData;
      }
    } catch (error) {
      console.log(`Live SSL check failed for ${domain}:`, error.message);
    }

    // Method 3: Try with www prefix
    if (!domain.startsWith('www.')) {
      try {
        const wwwSSLData = await this.getLiveSSLStatusWithTimeout(`www.${domain}`, 5000);
        if (wwwSSLData && wwwSSLData.hasSSL) {
          console.log(`AUTHENTIC www SSL found for ${domain}: expires ${wwwSSLData.expiryDate}, ${wwwSSLData.daysUntilExpiry} days remaining`);
          const result = { ...wwwSSLData, domain }; // Return with original domain
          this.cacheSSLResult(domain, result);
          return result;
        }
      } catch (error) {
        console.log(`www SSL check failed for ${domain}:`, error.message);
      }
    }

    // No SSL certificate found - cache this result too to prevent repeated checks
    console.log(`No authentic SSL certificate found for ${domain}`);
    const noSSLResult = {
      hasSSL: false,
      status: 'no_ssl',
      domain,
      expiryDate: null,
      daysUntilExpiry: null,
      isExpired: false,
      isExpiringSoon: false,
      issuer: null,
      source: 'none'
    };
    
    this.cacheSSLResult(domain, noSSLResult);
    return noSSLResult;
  }

  /**
   * Cache SSL results to prevent fluctuations
   */
  cacheSSLResult(domain, data) {
    this.sslCache.set(domain, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear SSL cache for a domain (use after SSL operations)
   */
  clearSSLCache(domain) {
    this.sslCache.delete(domain);
    // Also clear www variant
    if (!domain.startsWith('www.')) {
      this.sslCache.delete(`www.${domain}`);
    } else {
      this.sslCache.delete(domain.replace('www.', ''));
    }
  }

  /**
   * Clear all SSL cache for fresh statistics
   */
  clearAllSSLCache() {
    console.log('Clearing all SSL cache for accurate statistics');
    this.sslCache.clear();
    this.lastCacheClear = Date.now();
  }

  /**
   * Enhanced certificate detection checking multiple paths and methods
   */
  async checkMultipleCertPaths(domain) {
    console.log(`Enhanced SSL detection for ${domain}...`);
    
    // Method 1: Standard Let's Encrypt paths
    const certPaths = [
      `/etc/letsencrypt/live/${domain}/fullchain.pem`,
      `/etc/letsencrypt/live/${domain}/cert.pem`,
      `/etc/letsencrypt/archive/${domain}/fullchain1.pem`,
      `/etc/ssl/certs/${domain}.crt`,
      `/etc/ssl/certs/${domain}.pem`
    ];

    for (const certPath of certPaths) {
      try {
        const certData = await this.getSSLFromCertPath(certPath, domain);
        if (certData && certData.hasSSL) {
          console.log(`Found SSL certificate for ${domain} at ${certPath}`);
          return certData;
        }
      } catch (error) {
        // Continue checking other paths
      }
    }

    // Method 2: Check www variant certificates
    if (!domain.startsWith('www.')) {
      const wwwDomain = `www.${domain}`;
      for (const certPath of certPaths) {
        const wwwPath = certPath.replace(domain, wwwDomain);
        try {
          const certData = await this.getSSLFromCertPath(wwwPath, domain);
          if (certData && certData.hasSSL) {
            console.log(`Found SSL certificate for ${domain} via www variant at ${wwwPath}`);
            return certData;
          }
        } catch (error) {
          // Continue checking
        }
      }
    }

    // Method 3: Certbot certificate list check
    try {
      const certbotCerts = await this.getCertbotCertificates();
      const domainCert = certbotCerts.find(cert => 
        cert.domains && (cert.domains.includes(domain) || cert.domains.includes(`www.${domain}`))
      );
      
      if (domainCert && domainCert.path) {
        const certData = await this.getSSLFromCertPath(domainCert.path, domain);
        if (certData && certData.hasSSL) {
          console.log(`Found SSL certificate for ${domain} via certbot list`);
          return certData;
        }
      }
    } catch (error) {
      console.log(`Certbot list check failed for ${domain}:`, error.message);
    }

    return { hasSSL: false, domain };
  }

  /**
   * Get certificate data from specific file path
   */
  async getSSLFromCertPath(certPath, domain) {
    try {
      const fs = require('fs').promises;
      await fs.access(certPath);
      
      const { stdout } = await execAsync(`openssl x509 -in "${certPath}" -text -noout`);
      
      // Extract expiry date
      const expiryMatch = stdout.match(/Not After : (.+)/);
      if (!expiryMatch) {
        return { hasSSL: false, domain };
      }

      const expiryDate = new Date(expiryMatch[1]);
      const now = new Date();
      const daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));

      return {
        hasSSL: true,
        domain,
        expiryDate: expiryDate.toISOString(),
        daysUntilExpiry,
        isExpired: daysUntilExpiry <= 0,
        isExpiringSoon: daysUntilExpiry <= 30,
        certificatePath: certPath,
        issuer: this.extractIssuer(stdout),
        validFrom: this.extractValidFrom(stdout)
      };
    } catch (error) {
      return { hasSSL: false, domain, error: error.message };
    }
  }

  /**
   * Get all certificates from certbot
   */
  async getCertbotCertificates() {
    try {
      const { stdout } = await execAsync('certbot certificates 2>/dev/null || echo ""');
      return this.parseCertbotList(stdout);
    } catch (error) {
      console.log('Failed to get certbot certificates:', error.message);
      return [];
    }
  }

  /**
   * Parse certbot certificate list output
   */
  parseCertbotList(output) {
    const certificates = [];
    const certBlocks = output.split('- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -');
    
    for (const block of certBlocks) {
      if (block.trim()) {
        const nameMatch = block.match(/Certificate Name: (.+)/);
        const domainsMatch = block.match(/Domains: (.+)/);
        const pathMatch = block.match(/Certificate Path: (.+)/);
        
        if (nameMatch && domainsMatch && pathMatch) {
          certificates.push({
            name: nameMatch[1].trim(),
            domains: domainsMatch[1].split(' ').map(d => d.trim()),
            path: pathMatch[1].trim()
          });
        }
      }
    }
    
    return certificates;
  }

  /**
   * Get SSL certificate information using live connection with timeout protection
   */
  async getLiveSSLStatusWithTimeout(domain, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const tls = require('tls');
      
      const timeout = setTimeout(() => {
        console.log(`SSL check timeout for ${domain} after ${timeoutMs}ms`);
        resolve(null); // Don't reject, just return null
      }, timeoutMs);

      try {
        const socket = tls.connect(443, domain, {
          servername: domain,
          rejectUnauthorized: false,
          timeout: timeoutMs - 1000 // Leave 1 second buffer
        }, () => {
          clearTimeout(timeout);
          
          try {
            const cert = socket.getPeerCertificate();
            socket.destroy();
            
            if (!cert || !cert.valid_to) {
              console.log(`No valid certificate found for ${domain}`);
              resolve(null);
              return;
            }

            const expiryDate = new Date(cert.valid_to);
            if (isNaN(expiryDate.getTime())) {
              resolve(null);
              return;
            }

            // Calculate remaining days
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const expiry = new Date(expiryDate);
            expiry.setHours(0, 0, 0, 0);
            
            const timeDiff = expiry.getTime() - now.getTime();
            const daysRemaining = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

            resolve({
              hasSSL: true,
              status: daysRemaining < 0 ? 'expired' : (daysRemaining <= 30 ? 'expiring_soon' : 'active'),
              domain,
              expiryDate: expiryDate.toISOString(),
              daysUntilExpiry: daysRemaining,
              isExpired: daysRemaining < 0,
              isExpiringSoon: daysRemaining <= 30 && daysRemaining >= 0,
              issuer: cert.issuer?.O || 'Unknown',
              source: 'tls_connection'
            });
          } catch (certError) {
            console.log(`Error processing certificate for ${domain}:`, certError.message);
            socket.destroy();
            resolve(null);
          }
        });

        socket.on('error', (error) => {
          clearTimeout(timeout);
          console.log(`SSL connection failed for ${domain}:`, error.message);
          resolve(null); // Don't reject, just return null
        });

        socket.on('timeout', () => {
          clearTimeout(timeout);
          socket.destroy();
          console.log(`SSL connection timeout for ${domain}`);
          resolve(null);
        });

      } catch (error) {
        clearTimeout(timeout);
        console.log(`Failed to connect to ${domain}:`, error.message);
        resolve(null);
      }
    });
  }

  /**
   * Get SSL certificate information from files using OpenSSL command
   */
  async getSSLFromFiles(domain) {
    try {
      const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
      
      // Check if certificate file exists
      try {
        await fs.access(certPath);
      } catch (error) {
        // Try without www prefix
        if (domain.startsWith('www.')) {
          const noDomainPath = `/etc/letsencrypt/live/${domain.replace('www.', '')}/fullchain.pem`;
          try {
            await fs.access(noDomainPath);
            return await this.getSSLFromFiles(domain.replace('www.', ''));
          } catch (e) {
            return null;
          }
        }
        return null;
      }

      // Get certificate expiry date using OpenSSL
      const { stdout } = await execAsync(`openssl x509 -enddate -noout -in "${certPath}"`);
      const expiryMatch = stdout.match(/notAfter=(.+)/);
      
      if (!expiryMatch) {
        return null;
      }

      const expiryDate = new Date(expiryMatch[1]);
      if (isNaN(expiryDate.getTime())) {
        return null;
      }

      // Calculate remaining days
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const expiry = new Date(expiryDate);
      expiry.setHours(0, 0, 0, 0);
      
      const timeDiff = expiry.getTime() - now.getTime();
      const daysRemaining = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

      // Get issuer information
      let issuer = 'Unknown';
      try {
        const { stdout: issuerOutput } = await execAsync(`openssl x509 -issuer -noout -in "${certPath}"`);
        const issuerMatch = issuerOutput.match(/O\s*=\s*([^,]+)/);
        if (issuerMatch) {
          issuer = issuerMatch[1].trim();
        }
      } catch (issuerError) {
        console.log(`Could not get issuer for ${domain}:`, issuerError.message);
      }

      return {
        hasSSL: true,
        status: daysRemaining < 0 ? 'expired' : (daysRemaining <= 30 ? 'expiring_soon' : 'active'),
        domain,
        expiryDate: expiryDate.toISOString(),
        daysUntilExpiry: daysRemaining,
        isExpired: daysRemaining < 0,
        isExpiringSoon: daysRemaining <= 30 && daysRemaining >= 0,
        issuer,
        source: 'certificate_file'
      };

    } catch (error) {
      console.log(`Failed to get SSL from files for ${domain}:`, error.message);
      return null;
    }
  }
}

module.exports = SSLService;