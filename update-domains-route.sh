#!/bin/bash

# Quick fix for domain validation - update only domains.js on production server
# This script shows exactly what needs to be updated

echo "=== PRODUCTION SERVER UPDATE REQUIRED ==="
echo
echo "Your production server needs the updated domains.js file with validation routes."
echo
echo "Option 1: Upload via Git (recommended)"
echo "cd /var/www/nginx-control-panel"
echo "git pull origin main"
echo "pm2 restart ssl-manager"
echo
echo "Option 2: Manual file replacement"
echo "Replace /var/www/nginx-control-panel/routes/domains.js with the updated version"
echo
echo "Option 3: Add routes manually to existing domains.js"
echo "Add these routes to the end of your production domains.js file:"
echo
cat << 'EOF'

// Simple domain validation function
function validateDomain(domain) {
  domain = domain.replace(/^https?:\/\//, '');
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!domainRegex.test(domain)) {
    return { valid: false, error: 'Invalid domain format' };
  }
  
  if (domain.length > 253) {
    return { valid: false, error: 'Domain name too long' };
  }
  
  const parts = domain.split('.');
  if (parts.length < 2 || parts[parts.length - 1].length < 2) {
    return { valid: false, error: 'Invalid top-level domain' };
  }
  
  return { valid: true };
}

// Validate domain endpoint
router.post('/validate', (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({
      success: false,
      error: 'Domain is required'
    });
  }

  const validation = validateDomain(domain);
  res.json(validation);
});

// Add domain endpoint
router.post('/add', async (req, res) => {
  const { domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({
      success: false,
      error: 'Domain is required'
    });
  }

  const validation = validateDomain(domain);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      error: validation.error
    });
  }

  try {
    console.log(`Adding domain: ${domain}`);
    
    if (req.io) {
      req.io.emit('domain_added', { domain, success: true });
    }
    
    res.json({
      success: true,
      message: `Domain ${domain} added successfully`,
      domain: domain
    });
  } catch (error) {
    console.error('Error adding domain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add domain',
      message: error.message
    });
  }
});

EOF

echo
echo "After updating, test with:"
echo "curl -X POST https://sitedev.eezix.com/api/domains/validate -H 'Content-Type: application/json' -d '{\"domain\":\"test.com\"}'"
echo
echo "Expected response: {\"valid\":true}"