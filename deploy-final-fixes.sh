#!/bin/bash

# Deploy final fixes and improvements
echo "Creating final deployment package with all requested fixes..."

# Create deployment directory
mkdir -p final-fixes-deployment
cd final-fixes-deployment

# Copy all updated files
cp ../services/cloudnsService.js .
cp ../services/certbotService.js .
cp ../routes/ssl.js .
cp ../routes/cloudns-config.js .
cp ../public/app.js .
cp ../server.js .
cp ../.cloudns-config.example .
cp ../CLOUDNS_SETUP.md .

# Create comprehensive deployment instructions
cat > FINAL_DEPLOYMENT_INSTRUCTIONS.md << 'EOF'
# Final SSL Manager Deployment - All Fixes Applied

## Changes Made:

### 1. Removed SSL Install Button from Actions Panel
- SSL installation is now only available through the domain list
- Cleaner interface in the SSL details panel
- Only shows Renew button for domains with existing SSL

### 2. CloudNS Configuration via Hidden File
- CloudNS API credentials now configured via `.cloudns-config` file
- No environment variables needed
- Easy to update manually from backend
- Secure hidden file approach

## Files to Deploy:

1. **services/cloudnsService.js** - Updated to use hidden config file
2. **services/certbotService.js** - Updated with DNS method support
3. **routes/ssl.js** - Updated to handle method parameter
4. **routes/cloudns-config.js** - New CloudNS configuration routes
5. **public/app.js** - Removed SSL install button from actions panel
6. **server.js** - Added CloudNS config routes
7. **.cloudns-config.example** - Example configuration file
8. **CLOUDNS_SETUP.md** - Updated setup documentation

## Deployment Steps:

1. **Upload all files to production server:**
   ```bash
   # Upload to /var/www/nginx-control-panel/
   - services/cloudnsService.js
   - services/certbotService.js
   - routes/ssl.js
   - routes/cloudns-config.js (new file)
   - public/app.js
   - server.js
   - .cloudns-config.example
   - CLOUDNS_SETUP.md
   ```

2. **Configure CloudNS credentials (if using DNS method):**
   ```bash
   cd /var/www/nginx-control-panel
   cp .cloudns-config.example .cloudns-config
   nano .cloudns-config
   ```
   
   Edit with your actual CloudNS credentials:
   ```json
   {
     "authId": "your_actual_cloudns_auth_id",
     "authPassword": "your_actual_cloudns_password",
     "subAuthId": ""
   }
   ```

3. **Restart application:**
   ```bash
   pm2 restart nginx-control-panel
   ```

## New Features:

### SSL Installation Methods:
- **Nginx Method (Default)**: Standard web server verification
- **DNS Method (CloudNS)**: DNS challenge verification using CloudNS.net
- Method selection dropdown in SSL installation form
- Automatic method tracking for renewals

### Interface Improvements:
- Removed redundant SSL install button from actions panel
- SSL installation only available from domain list
- Cleaner SSL details interface
- Better method selection UI

### CloudNS Integration:
- Hidden configuration file approach
- Easy manual backend configuration
- Secure credential storage
- Automatic method detection
- Proper error handling for missing credentials

## Testing:

### Without CloudNS credentials:
- Nginx method works normally
- DNS method shows appropriate error message
- No functionality is broken

### With CloudNS credentials:
- Both nginx and DNS methods work
- Method selection persists for renewals
- Automatic DNS record management

## CloudNS Setup:

1. Get CloudNS.net API credentials from your account
2. Create `.cloudns-config` file with your credentials
3. Restart application
4. DNS method will be available for SSL installation

EOF

echo "Final deployment package created successfully!"
echo "All requested fixes applied:"
echo "- Removed SSL install button from actions panel"
echo "- CloudNS configuration via hidden file (.cloudns-config)"
echo "- Updated all services and routes"
echo "- Complete deployment documentation included"