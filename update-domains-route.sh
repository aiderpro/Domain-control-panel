#!/bin/bash

# Simple script to copy the updated domains.js to your production server
# Run this directly on your production server

echo "Updating domains.js with domain addition functionality..."

# Create backup
cp /var/www/nginx-control-panel/routes/domains.js /var/www/nginx-control-panel/routes/domains.js.backup.$(date +%Y%m%d_%H%M%S)

# Download the updated file directly from this development environment
# You'll need to manually copy the content from routes/domains.js to your production server

echo "Current production file backed up."
echo
echo "Now replace /var/www/nginx-control-panel/routes/domains.js with the new version"
echo "Then restart your service:"
echo "  pm2 restart ssl-manager"
echo
echo "Test with:"
echo "  curl -X POST https://sitedev.eezix.com/api/domains/validate -H 'Content-Type: application/json' -d '{\"domain\":\"test.com\"}'"