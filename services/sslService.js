const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;

const execAsync = promisify(exec);

class SSLService {
  constructor() {
    this.sslCache = new Map(); // Cache SSL results to prevent fluctuations
    this.cacheTimeout = 300000; // 5 minutes cache
  }

  /**
   * Check SSL certificate status using cached results to prevent fluctuations
   */
  async checkSSLStatus(domain) {
    // Check cache first to prevent fluctuations
    const cached = this.sslCache.get(domain);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      console.log(`Using cached SSL status for ${domain}`);
      return cached.data;
    }

    console.log(`Checking AUTHENTIC SSL status for ${domain}...`);
    
    // Method 1: Try certificate files first (most reliable)
    try {
      const fileSSLData = await this.getSSLFromFiles(domain);
      if (fileSSLData && fileSSLData.hasSSL) {
        console.log(`AUTHENTIC file SSL found for ${domain}: expires ${fileSSLData.expiryDate}, ${fileSSLData.daysUntilExpiry} days remaining`);
        this.cacheSSLResult(domain, fileSSLData);
        return fileSSLData;
      }
    } catch (error) {
      console.log(`File SSL check failed for ${domain}:`, error.message);
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
   * Clear all SSL cache
   */
  clearAllSSLCache() {
    this.sslCache.clear();
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