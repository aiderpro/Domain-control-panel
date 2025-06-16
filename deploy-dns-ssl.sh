#!/bin/bash

# Deploy DNS SSL installation feature to production server
echo "Creating DNS SSL deployment package..."

# Create deployment directory
mkdir -p dns-ssl-deployment
cd dns-ssl-deployment

# Copy CloudNS service
cp ../services/cloudnsService.js .

# Copy updated CertbotService with DNS support
cp ../services/certbotService.js .

# Copy updated SSL routes with method support
cp ../routes/ssl.js .

# Copy updated frontend with dropdown selection
cp ../public/app.js .

# Copy CloudNS setup documentation
cp ../CLOUDNS_SETUP.md .

# Create deployment instructions
cat > DEPLOYMENT_INSTRUCTIONS.md << 'EOF'
# DNS SSL Installation Feature Deployment

## New Features Added:
- CloudNS DNS challenge support for SSL installation
- Dropdown selection between nginx and DNS methods
- Method tracking for proper renewals
- Comprehensive CloudNS API integration

## Files to upload to production server:

1. **services/cloudnsService.js** - New CloudNS API integration service
2. **services/certbotService.js** - Updated with DNS method support
3. **routes/ssl.js** - Updated to handle method parameter
4. **public/app.js** - Updated with method dropdown selection
5. **CLOUDNS_SETUP.md** - CloudNS configuration documentation

## Deployment Steps:

1. Upload cloudnsService.js to `/var/www/nginx-control-panel/services/`
2. Replace `/var/www/nginx-control-panel/services/certbotService.js`
3. Replace `/var/www/nginx-control-panel/routes/ssl.js`
4. Replace `/var/www/nginx-control-panel/public/app.js`
5. Upload CLOUDNS_SETUP.md to `/var/www/nginx-control-panel/`
6. Restart: `pm2 restart nginx-control-panel`

## CloudNS Configuration (Required for DNS method):

Add environment variables to your server:
```bash
export CLOUDNS_AUTH_ID="your_cloudns_auth_id"
export CLOUDNS_AUTH_PASSWORD="your_cloudns_password"
```

## New SSL Installation Options:

1. **Nginx Method (Default)**: Uses web server verification
   - Domain must point to your server
   - Standard certbot nginx integration

2. **DNS Method (CloudNS)**: Uses DNS challenge verification
   - Works even if domain doesn't point to server
   - Requires CloudNS.net API credentials
   - Automatically manages DNS TXT records

## Method Tracking:

The system automatically tracks installation methods:
- Initial installation method is saved
- Renewals use the same method as installation
- Method data stored in `data/ssl-methods.json`

## Testing:

- Without CloudNS credentials: DNS method shows error, nginx method works
- With CloudNS credentials: Both methods work properly
- Method selection persists for renewals

EOF

echo "DNS SSL deployment package created successfully!"
echo "Review DEPLOYMENT_INSTRUCTIONS.md for complete setup details"