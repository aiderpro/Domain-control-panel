const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;

const execAsync = promisify(exec);

class SSLService {
  /**
   * Check SSL certificate status using ONLY authentic data - NO DEMO DATA
   */
  async checkSSLStatus(domain) {
    console.log(`Checking AUTHENTIC SSL status for ${domain}...`);
    
    // Method 1: Live SSL connection with your exact OpenSSL command
    try {
      const liveSSLData = await this.getLiveSSLStatus(domain);
      if (liveSSLData && liveSSLData.hasSSL) {
        console.log(`AUTHENTIC SSL found for ${domain}: expires ${liveSSLData.expiryDate}, ${liveSSLData.daysUntilExpiry} days remaining`);
        return liveSSLData;
      }
    } catch (error) {
      console.log(`Live SSL check failed for ${domain}:`, error.message);
    }

    // Method 2: Certificate files with your exact OpenSSL command
    try {
      const fileSSLData = await this.getSSLFromFiles(domain);
      if (fileSSLData && fileSSLData.hasSSL) {
        console.log(`AUTHENTIC file SSL found for ${domain}: expires ${fileSSLData.expiryDate}, ${fileSSLData.daysUntilExpiry} days remaining`);
        return fileSSLData;
      }
    } catch (error) {
      console.log(`File SSL check failed for ${domain}:`, error.message);
    }

    // Method 3: Try with www prefix
    if (!domain.startsWith('www.')) {
      try {
        const wwwSSLData = await this.getLiveSSLStatus(`www.${domain}`);
        if (wwwSSLData && wwwSSLData.hasSSL) {
          console.log(`AUTHENTIC www SSL found for ${domain}: expires ${wwwSSLData.expiryDate}, ${wwwSSLData.daysUntilExpiry} days remaining`);
          return { ...wwwSSLData, domain }; // Return with original domain
        }
      } catch (error) {
        console.log(`www SSL check failed for ${domain}:`, error.message);
      }
    }

    // No SSL certificate found
    console.log(`No authentic SSL certificate found for ${domain}`);
    return {
      status: 'no_ssl',
      hasSSL: false,
      domain,
      message: 'No SSL certificate found'
    };
  }

  /**
   * Get SSL certificate information using live connection with your exact OpenSSL command
   */
  async getLiveSSLStatus(domain) {
    try {
      // Your exact OpenSSL command: openssl s_client -connect domain:443 -servername domain 2>/dev/null | openssl x509 -noout -enddate
      const command = `timeout 15s bash -c "openssl s_client -connect ${domain}:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -enddate"`;
      console.log(`Running live SSL check for ${domain}`);
      
      const { stdout } = await execAsync(command);
      
      if (!stdout || !stdout.trim()) {
        console.log(`No SSL data returned for ${domain}`);
        return null;
      }
      
      console.log(`Live SSL output for ${domain}:`, stdout.trim());
      
      // Parse the enddate output: "notAfter=Jul 23 09:13:49 2025 GMT"
      const endDateMatch = stdout.match(/notAfter=(.+)/);
      if (!endDateMatch) {
        console.log(`Could not parse enddate for ${domain}`);
        return null;
      }

      const expiryDate = new Date(endDateMatch[1]);
      if (isNaN(expiryDate.getTime())) {
        console.log(`Invalid expiry date for ${domain}: ${endDateMatch[1]}`);
        return null;
      }

      // Calculate remaining days
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const expiry = new Date(expiryDate);
      expiry.setHours(0, 0, 0, 0);
      
      const timeDiff = expiry.getTime() - now.getTime();
      const daysRemaining = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

      console.log(`AUTHENTIC SSL for ${domain}: expires ${expiryDate.toISOString()}, ${daysRemaining} days remaining`);

      return {
        hasSSL: true,
        status: daysRemaining < 0 ? 'expired' : (daysRemaining <= 30 ? 'expiring_soon' : 'active'),
        domain,
        expiryDate: expiryDate.toISOString(),
        daysUntilExpiry: daysRemaining,
        isExpired: daysRemaining < 0,
        isExpiringSoon: daysRemaining <= 30 && daysRemaining >= 0,
        issuer: 'Let\'s Encrypt',
        source: 'live_connection'
      };
      
    } catch (error) {
      console.log(`Failed to get live SSL for ${domain}:`, error.message);
      return null;
    }
  }

  /**
   * Get SSL certificate information from files using your exact OpenSSL command
   */
  async getSSLFromFiles(domain) {
    const possiblePaths = [
      `/etc/letsencrypt/live/${domain}/cert.pem`,
      `/etc/ssl/acme/${domain}/cert.pem`,
      `/root/.acme.sh/${domain}/cert.pem`,
      `/etc/ssl/certs/${domain}.pem`
    ];

    // Also check for www variant
    if (!domain.startsWith('www.')) {
      possiblePaths.push(
        `/etc/letsencrypt/live/www.${domain}/cert.pem`,
        `/etc/ssl/acme/www.${domain}/cert.pem`,
        `/root/.acme.sh/www.${domain}/cert.pem`,
        `/etc/ssl/certs/www.${domain}.pem`
      );
    }

    for (const certPath of possiblePaths) {
      try {
        await fs.access(certPath);
        
        // Your exact OpenSSL command: openssl x509 -in /path/cert.pem -noout -enddate
        const command = `openssl x509 -in ${certPath} -noout -enddate`;
        const { stdout } = await execAsync(command);
        
        if (stdout.trim()) {
          console.log(`File SSL output for ${domain} from ${certPath}:`, stdout.trim());
          
          // Parse the enddate output: "notAfter=Jul 23 09:13:49 2025 GMT"
          const endDateMatch = stdout.match(/notAfter=(.+)/);
          if (!endDateMatch) {
            continue;
          }

          const expiryDate = new Date(endDateMatch[1]);
          if (isNaN(expiryDate.getTime())) {
            continue;
          }

          // Calculate remaining days
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const expiry = new Date(expiryDate);
          expiry.setHours(0, 0, 0, 0);
          
          const timeDiff = expiry.getTime() - now.getTime();
          const daysRemaining = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

          console.log(`AUTHENTIC file SSL for ${domain}: expires ${expiryDate.toISOString()}, ${daysRemaining} days remaining`);

          return {
            hasSSL: true,
            status: daysRemaining < 0 ? 'expired' : (daysRemaining <= 30 ? 'expiring_soon' : 'active'),
            domain,
            expiryDate: expiryDate.toISOString(),
            daysUntilExpiry: daysRemaining,
            isExpired: daysRemaining < 0,
            isExpiringSoon: daysRemaining <= 30 && daysRemaining >= 0,
            issuer: 'Let\'s Encrypt',
            source: certPath
          };
        }
      } catch (error) {
        // Continue to next path
      }
    }
    
    return null;
  }
}

module.exports = new SSLService();