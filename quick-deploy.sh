#!/bin/bash

# Quick deployment script for nginx domain addition functionality
# Run this on your production server (sitedev.eezix.com)

echo "=== Quick Deploy: Domain Addition Feature ==="
echo
echo "1. Backup current domains.js:"
echo "cp /var/www/nginx-control-panel/routes/domains.js /var/www/nginx-control-panel/routes/domains.js.backup"
echo
echo "2. Replace domains.js with updated version from Git:"
echo "cd /var/www/nginx-control-panel"
echo "git pull origin main"
echo
echo "3. Restart the server:"
echo "pm2 restart ssl-manager"
echo "# OR if using systemd:"
echo "# sudo systemctl restart nginx-control-panel"
echo
echo "4. Test the domain addition endpoint:"
echo "curl -X POST https://sitedev.eezix.com/api/domains/validate -H 'Content-Type: application/json' -d '{\"domain\":\"test.com\"}'"
echo
echo "Expected response: {\"valid\":true}"
echo
echo "=== Manual Option (if Git is not available) ==="
echo "If you can't use Git, manually replace the content of:"
echo "/var/www/nginx-control-panel/routes/domains.js"
echo "with the updated version from this development environment."
echo
echo "The updated domains.js file includes:"
echo "- POST /api/domains/validate - Domain validation"
echo "- POST /api/domains/add - Create nginx configuration"
echo "- nginx -t testing"
echo "- systemctl reload nginx"
echo "- Document root: /var/www/html"