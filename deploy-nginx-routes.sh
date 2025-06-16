#!/bin/bash

# SSL Manager - Deploy nginx routes to production server
# This script creates a deployment package with the missing nginx routes

echo "Creating deployment package for nginx routes..."

# Create temporary deployment directory
mkdir -p deployment-package/routes
mkdir -p deployment-package/services

# Copy nginx route files
cp routes/nginx-config.js deployment-package/routes/
cp routes/domains.js deployment-package/routes/
cp routes/ssl.js deployment-package/routes/

# Copy service files  
cp services/nginxService.js deployment-package/services/
cp services/certbotService.js deployment-package/services/
cp services/sslService.js deployment-package/services/

# Copy main server file
cp server.js deployment-package/

# Copy package.json
cp package.json deployment-package/

# Create deployment instructions
cat > deployment-package/DEPLOY_INSTRUCTIONS.md << 'EOF'
# Nginx Routes Deployment Instructions

## Files to upload to production server:

1. **routes/nginx-config.js** - Contains nginx domain management routes
2. **server.js** - Main server file with route registration
3. **package.json** - Dependencies

## Routes that will be added:

- POST /api/nginx/validate-domain
- POST /api/nginx/add-domain  
- GET /api/nginx/test-config
- POST /api/nginx/reload-config

## Deployment Steps:

1. Stop the production server
2. Upload these files to /var/www/nginx-control-panel/
3. Run: npm install (if new dependencies)
4. Restart the server: node server.js
5. Test the nginx routes

## Verification:

Test that the nginx routes work:
```bash
curl -X POST https://sitedev.eezix.com/api/nginx/validate-domain \
  -H "Content-Type: application/json" \
  -d '{"domain":"test.com"}'
```

Should return: {"valid":true}
EOF

# Create tar archive
tar -czf nginx-routes-deployment.tar.gz deployment-package/

echo "Deployment package created: nginx-routes-deployment.tar.gz"
echo "Upload this to your production server and follow DEPLOY_INSTRUCTIONS.md"

# Clean up
rm -rf deployment-package/

ls -la nginx-routes-deployment.tar.gz