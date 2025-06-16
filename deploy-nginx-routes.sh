#!/bin/bash

echo "=== Nginx Routes Deployment Script ==="
echo "Run this on your production server (sitedev.eezix.com)"
echo

# Step 1: Backup current file
echo "1. Backing up current domains.js:"
echo "   cp /var/www/nginx-control-panel/routes/domains.js /var/www/nginx-control-panel/routes/domains.js.backup"
echo

# Step 2: Show the file replacement
echo "2. Replace domains.js with new version:"
echo "   The new domains.js file needs to be uploaded to:"
echo "   /var/www/nginx-control-panel/routes/domains.js"
echo

# Step 3: Restart service
echo "3. Restart your application:"
echo "   pm2 restart ssl-manager"
echo "   # OR if using systemd:"
echo "   # sudo systemctl restart nginx-control-panel"
echo

# Step 4: Test
echo "4. Test the endpoints:"
echo "   curl -X POST https://sitedev.eezix.com/api/domains/validate \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"domain\":\"test.example.com\"}'"
echo
echo "   Expected: {\"valid\":true}"
echo

echo "=== Files to upload ==="
echo "1. routes/domains.js (main file with domain addition endpoints)"
echo "2. create-domain.sh (optional: manual domain creation script)"
echo

echo "=== What the new domains.js includes ==="
echo "- POST /api/domains/validate - Domain validation"
echo "- POST /api/domains/add - Automated nginx configuration creation"
echo "- Automatic nginx testing (nginx -t)"
echo "- Automatic nginx reloading (systemctl reload nginx)"
echo "- Document root set to /var/www/html"
echo "- Full error handling and logging"
echo

echo "Once deployed, domain addition will work automatically through the web interface!"