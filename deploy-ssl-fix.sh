#!/bin/bash

# SSL Expiry Fix Deployment Script for cpanel.webeezix.in
# This script deploys the corrected SSL service that shows real certificate dates

echo "Deploying SSL expiry fix to production server..."

# Create deployment package with fixed SSL service
tar -czf ssl-expiry-fix.tar.gz \
  services/sslService.js \
  routes/ssl.js \
  routes/domains.js

echo "Deployment package created: ssl-expiry-fix.tar.gz"
echo ""
echo "To deploy to production server:"
echo "1. Upload ssl-expiry-fix.tar.gz to your production server"
echo "2. Extract: tar -xzf ssl-expiry-fix.tar.gz"
echo "3. Restart the server: pm2 restart ssl-manager"
echo ""
echo "The fixed SSL service will then show authentic certificate expiry dates"
echo "instead of hardcoded September 15th demo data."