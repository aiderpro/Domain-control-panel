#!/bin/bash

# Quick Production Deployment - Copy files and restart
# Run this to update production with latest changes

echo "Deploying to production..."

# Copy key files to production server
echo "Copying files..."
rsync -avz routes/domains.js root@sitedev.eezix.com:/var/www/nginx-control-panel/routes/
rsync -avz public/app.js root@sitedev.eezix.com:/var/www/nginx-control-panel/public/
rsync -avz server.js root@sitedev.eezix.com:/var/www/nginx-control-panel/
rsync -avz services/ root@sitedev.eezix.com:/var/www/nginx-control-panel/services/

# Restart production service
echo "Restarting service..."
ssh root@sitedev.eezix.com "cd /var/www/nginx-control-panel && pm2 restart nginx-control-panel"

echo "Production deployment complete!"
echo "Access: https://sitedev.eezix.com"