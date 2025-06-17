const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;

const execAsync = promisify(exec);

class SSLService {
  /**
   * Check SSL certificate status for a domain (always fresh data)
   */
  async checkSSLStatus(domain) {
    console.log(`Checking SSL status for ${domain} using OpenSSL and Certbot commands...`);
    
    // Method 1: Try OpenSSL enddate command on certificate files (most accurate)
    try {
      const fileSSLData = await this.getSSLFromFiles(domain);
      if (fileSSLData && fileSSLData.hasSSL) {
        console.log(`OpenSSL file check for ${domain}: expires ${fileSSLData.expiryDate}, ${fileSSLData.daysUntilExpiry} days remaining`);
        return fileSSLData;
      }
    } catch (error) {
      console.log(`OpenSSL file check failed for ${domain}:`, error.message);
    }

    // Method 2: Try Certbot certificates command for verification
    try {
      const certbotSSLData = await this.getSSLFromCertbot(domain);
      if (certbotSSLData && certbotSSLData.hasSSL) {
        console.log(`Certbot check for ${domain}: expires ${certbotSSLData.expiryDate}, ${certbotSSLData.daysUntilExpiry} days remaining`);
        return certbotSSLData;
      }
    } catch (error) {
      console.log(`Certbot check failed for ${domain}:`, error.message);
    }

    // Method 3: Try with www prefix
    if (!domain.startsWith('www.')) {
      try {
        const wwwFileSSLData = await this.getSSLFromFiles(`www.${domain}`);
        if (wwwFileSSLData && wwwFileSSLData.hasSSL) {
          console.log(`OpenSSL www check for ${domain}: expires ${wwwFileSSLData.expiryDate}, ${wwwFileSSLData.daysUntilExpiry} days remaining`);
          return { ...wwwFileSSLData, domain }; // Return with original domain
        }
      } catch (error) {
        console.log(`OpenSSL www file check failed for ${domain}:`, error.message);
      }
    }

    // Method 4: Fallback to live connection check
    try {
      const realSSLData = await this.getRealSSLStatus(domain);
      if (realSSLData && realSSLData.hasSSL) {
        console.log(`Live connection check for ${domain}: expires ${realSSLData.expiryDate}, ${realSSLData.daysUntilExpiry} days remaining`);
        return realSSLData;
      }
    } catch (error) {
      console.log(`Live connection check failed for ${domain}:`, error.message);
    }

    // Method 5: Try live connection with www prefix
    if (!domain.startsWith('www.')) {
      try {
        const wwwRealSSLData = await this.getRealSSLStatus(`www.${domain}`);
        if (wwwRealSSLData && wwwRealSSLData.hasSSL) {
          console.log(`Found live SSL certificate for www.${domain}, issued: ${wwwRealSSLData.issuedDate}, expires: ${wwwRealSSLData.expiryDate}, ${wwwRealSSLData.daysUntilExpiry} days remaining`);
          return { ...wwwRealSSLData, domain }; // Return with original domain
        }
      } catch (error) {
        console.log(`Failed to get live SSL for www.${domain}:`, error.message);
      }
    }
    
    // No SSL certificate found
    console.log(`No SSL certificate found for ${domain}`);
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
      // Use timeout and more robust openssl command
      const command = `timeout 10s bash -c "echo | openssl s_client -servername ${domain} -connect ${domain}:443 -verify_return_error 2>/dev/null | openssl x509 -noout -dates -subject -issuer -fingerprint 2>/dev/null"`;
      const { stdout, stderr } = await execAsync(command);
      
      if (!stdout || !stdout.trim()) {
        console.log(`No SSL certificate data returned for ${domain}`);
        return null;
      }
      
      const result = this.parseSSLOutput(stdout, domain, 'live');
      if (result && result.hasSSL) {
        console.log(`Successfully parsed live SSL for ${domain}: expires ${result.expiryDate}, ${result.daysUntilExpiry} days remaining`);
      }
      
      return result;
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

    // Also check for www variant if domain doesn't start with www
    if (!domain.startsWith('www.')) {
      possiblePaths.push(
        `/etc/letsencrypt/live/www.${domain}/fullchain.pem`,
        `/etc/ssl/acme/www.${domain}/fullchain.pem`,
        `/root/.acme.sh/www.${domain}/fullchain.cer`,
        `/etc/ssl/certs/www.${domain}.pem`
      );
    }

    for (const certPath of possiblePaths) {
      try {
        await fs.access(certPath);
        // Use exact OpenSSL command specified by user
        const command = `openssl x509 -in ${certPath} -noout -enddate`;
        const { stdout } = await execAsync(command);
        
        if (stdout.trim()) {
          const result = this.parseEndDateOutput(stdout, domain, certPath);
          if (result && result.hasSSL) {
            console.log(`SSL certificate found at: ${certPath}, ${result.daysUntilExpiry} days remaining`);
            return result;
          }
        }
      } catch (error) {
        // Continue to next path
      }
    }
    
    return null;
  }

  /**
   * Get SSL expiry using certbot certificates command
   */
  async getSSLFromCertbot(domain) {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    try {
      // Use exact certbot command specified by user
      const { stdout } = await execAsync('sudo certbot certificates');
      
      console.log(`Certbot certificates output for ${domain}:`);
      console.log(stdout);

      // Parse certbot output to find the domain
      const lines = stdout.split('\n');
      let foundDomain = false;
      let expiryDate = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Look for certificate name that matches our domain
        if (line.includes(`Certificate Name: ${domain}`) || 
            line.includes(`Domains: ${domain}`) ||
            line.includes(`Domains: www.${domain}`) ||
            line.includes(`${domain} www.${domain}`)) {
          foundDomain = true;
          continue;
        }

        // If we found the domain, look for expiry date on subsequent lines
        if (foundDomain && line.includes('Expiry Date:')) {
          const expiryMatch = line.match(/Expiry Date: (.+?) \(/);
          if (expiryMatch) {
            expiryDate = new Date(expiryMatch[1]);
            break;
          }
        }
      }

      if (!expiryDate || isNaN(expiryDate.getTime())) {
        console.log(`Could not find or parse expiry date from certbot for ${domain}`);
        return null;
      }

      // Calculate remaining days
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const expiry = new Date(expiryDate);
      expiry.setHours(0, 0, 0, 0);
      
      const timeDiff = expiry.getTime() - now.getTime();
      const daysRemaining = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

      console.log(`Certbot SSL expiry for ${domain}: expires ${expiryDate.toISOString()}, ${daysRemaining} days remaining`);

      return {
        hasSSL: true,
        expiryDate: expiryDate.toISOString(),
        daysUntilExpiry: daysRemaining,
        isExpired: daysRemaining < 0,
        isExpiringSoon: daysRemaining <= 30 && daysRemaining >= 0,
        issuer: 'Let\'s Encrypt',
        source: 'certbot_certificates'
      };

    } catch (error) {
      console.log(`Failed to get SSL expiry using certbot for ${domain}:`, error.message);
      return null;
    }
  }

  /**
   * Parse enddate output from openssl x509 -enddate command
   */
  parseEndDateOutput(output, domain, source = null) {
    console.log(`Parsing OpenSSL enddate output for ${domain} from ${source}:`);
    console.log(output.trim());

    // Parse the enddate output: "notAfter=Dec 15 10:30:00 2025 GMT"
    const endDateMatch = output.match(/notAfter=(.+)/);
    if (!endDateMatch) {
      console.log(`Could not parse enddate from OpenSSL output for ${domain}`);
      return null;
    }

    const expiryDate = new Date(endDateMatch[1]);
    if (isNaN(expiryDate.getTime())) {
      console.log(`Invalid expiry date parsed for ${domain}: ${endDateMatch[1]}`);
      return null;
    }

    // Calculate remaining days
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    
    const timeDiff = expiry.getTime() - now.getTime();
    const daysRemaining = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

    console.log(`SSL expiry for ${domain}: expires ${expiryDate.toISOString()}, ${daysRemaining} days remaining`);

    return {
      hasSSL: true,
      expiryDate: expiryDate.toISOString(),
      daysUntilExpiry: daysRemaining,
      isExpired: daysRemaining < 0,
      isExpiringSoon: daysRemaining <= 30 && daysRemaining >= 0,
      issuer: 'Let\'s Encrypt',
      source: source || 'openssl_enddate'
    };
  }

  /**
   * Parse SSL certificate output from openssl command
   */
  parseSSLOutput(output, domain, source = null) {
    const lines = output.split('\n');
    let notBefore = null;
    let notAfter = null;
    let subject = '';
    let issuer = '';
    let fingerprint = '';

    console.log(`Parsing SSL output for ${domain} from ${source}:`);
    console.log(output);

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('notBefore=')) {
        const dateStr = trimmedLine.replace('notBefore=', '');
        notBefore = new Date(dateStr);
        console.log(`Parsed notBefore: ${dateStr} -> ${notBefore}`);
      } else if (trimmedLine.startsWith('notAfter=')) {
        const dateStr = trimmedLine.replace('notAfter=', '');
        notAfter = new Date(dateStr);
        console.log(`Parsed notAfter: ${dateStr} -> ${notAfter}`);
      } else if (trimmedLine.startsWith('subject=')) {
        subject = trimmedLine.replace('subject=', '');
      } else if (trimmedLine.startsWith('issuer=')) {
        issuer = trimmedLine.replace('issuer=', '');
      } else if (trimmedLine.startsWith('SHA1 Fingerprint=') || trimmedLine.startsWith('Fingerprint=')) {
        fingerprint = trimmedLine.replace(/^(SHA1 )?Fingerprint=/, '');
      }
    }

    if (!notAfter || isNaN(notAfter.getTime())) {
      console.log(`Invalid or missing expiry date for ${domain}`);
      return null;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0); // Reset to start of day for accurate calculation
    const expiryDateOnly = new Date(notAfter);
    expiryDateOnly.setHours(0, 0, 0, 0); // Reset to start of day
    
    const timeDiff = expiryDateOnly.getTime() - now.getTime();
    const daysUntilExpiry = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const isExpired = daysUntilExpiry < 0;
    const isExpiringSoon = daysUntilExpiry <= 30 && !isExpired;

    console.log(`SSL calculation for ${domain}: expires ${notAfter.toISOString()}, ${daysUntilExpiry} days remaining`);

    // Extract issuer organization
    const issuerMatch = issuer.match(/O=([^,]+)/);
    const issuerOrg = issuerMatch ? issuerMatch[1] : 'Unknown';

    // Extract common name from subject
    const cnMatch = subject.match(/CN=([^,]+)/);
    const commonName = cnMatch ? cnMatch[1] : domain;

    return {
      status: isExpired ? 'expired' : 'active',
      hasSSL: true,
      domain,
      issuedDate: notBefore,
      expiryDate: notAfter,
      validFrom: notBefore?.toISOString(),
      validTo: notAfter.toISOString(),
      daysUntilExpiry,
      isExpiringSoon,
      isExpired,
      commonName,
      subject,
      issuer,
      issuerOrg,
      fingerprint,
      source
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
