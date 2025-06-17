# Git Deployment Commands for SSL Fix

## On your production server (cpanel.webeezix.in):

```bash
# 1. Navigate to your SSL manager directory
cd /path/to/ssl-manager

# 2. Backup current SSL service
cp services/sslService.js services/sslService.js.backup

# 3. Update the SSL service with this exact content:
cat > services/sslService.js << 'SSLSERVICE'
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
    
    // Method 1: Live SSL connection with TLS
    try {
      const liveSSLData = await this.getLiveSSLStatus(domain);
      if (liveSSLData && liveSSLData.hasSSL) {
        console.log(`AUTHENTIC SSL found for ${domain}: expires ${liveSSLData.expiryDate}, ${liveSSLData.daysUntilExpiry} days remaining`);
        return liveSSLData;
      }
    } catch (error) {
      console.log(`Live SSL check failed for ${domain}:`, error.message);
    }

    // Method 2: Certificate files with OpenSSL command
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
   * Get SSL certificate information using live connection with TLS
   */
  async getLiveSSLStatus(domain) {
    try {
      // Use Node.js TLS to get certificate info
      const tls = require('tls');
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`SSL check timeout for ${domain}`));
        }, 10000);

        const socket = tls.connect(443, domain, {
          servername: domain,
          rejectUnauthorized: false
        }, () => {
          clearTimeout(timeout);
          
          const cert = socket.getPeerCertificate();
          socket.destroy();
          
          if (!cert || !cert.valid_to) {
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

          console.log(`AUTHENTIC SSL for ${domain}: expires ${expiryDate.toISOString()}, ${daysRemaining} days remaining`);

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
        });

        socket.on('error', (error) => {
          clearTimeout(timeout);
          console.log(`SSL connection failed for ${domain}:`, error.message);
          resolve(null);
        });
      });
      
    } catch (error) {
      console.log(`Failed to get live SSL for ${domain}:`, error.message);
      return null;
    }
  }

  /**
   * Get SSL certificate information from files using OpenSSL command
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
        
        // OpenSSL command: openssl x509 -in /path/cert.pem -noout -enddate
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
SSLSERVICE

# 4. Restart the application
pm2 restart ssl-manager || npm restart || (pkill -f "node server.js" && node server.js &)

# 5. Test the fix
echo "Testing SSL fix..."
sleep 3
curl -s "http://localhost:8000/api/domains" | grep -A5 "a3cabscochin" || echo "Server restarting..."

echo "SSL service updated! Should now show July 23, 2025 for a3cabscochin.com"
```

## Expected Result:
a3cabscochin.com will show:
- Expires: July 23, 2025  
- Days remaining: 36 days
- Instead of September 15th demo data

