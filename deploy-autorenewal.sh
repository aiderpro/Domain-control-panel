#!/bin/bash

# Deploy autorenewal functionality to production server
echo "Creating autorenewal deployment package..."

# Create deployment directory
mkdir -p autorenewal-deployment
cd autorenewal-deployment

# Copy autorenewal routes
cp ../routes/autorenewal.js .

# Copy updated app.js with autorenewal functionality
cp ../public/app.js .

# Copy updated server.js with autorenewal routes
cp ../server.js .

# Create deployment instructions
cat > DEPLOYMENT_INSTRUCTIONS.md << 'EOF'
# Autorenewal System Deployment Instructions

## Files to upload to production server:

1. **routes/autorenewal.js** - New autorenewal API routes
2. **public/app.js** - Updated frontend with autorenewal tab
3. **server.js** - Updated server with autorenewal route mounting

## Deployment steps:

1. Upload autorenewal.js to `/var/www/nginx-control-panel/routes/`
2. Replace `/var/www/nginx-control-panel/public/app.js`
3. Replace `/var/www/nginx-control-panel/server.js`
4. Create data directory: `mkdir -p /var/www/nginx-control-panel/data`
5. Restart the application: `pm2 restart nginx-control-panel`

## Features added:
- SSL Auto-renewal management tab
- Global autorenewal settings
- Per-domain autorenewal control
- Renewal status monitoring
- Automated renewal checks with cron jobs

EOF

echo "Autorenewal deployment package created in autorenewal-deployment/"
echo "Upload the files to production server as instructed in DEPLOYMENT_INSTRUCTIONS.md"