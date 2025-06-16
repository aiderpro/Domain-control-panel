# Complete Git Deployment Guide

## Files to Add/Update in Your Git Repository

### 1. Root Files
- `server.js` - Main Express server with all route registrations
- `package.json` - Node.js dependencies and scripts
- `package-lock.json` - Dependency lock file
- `README.md` - Complete installation and usage documentation

### 2. Routes Directory (`routes/`)
- `domains.js` - Domain discovery and management API
- `ssl.js` - SSL certificate installation and renewal API
- `nginx-config.js` - **CRITICAL: This file was missing from production**

### 3. Services Directory (`services/`)
- `nginxService.js` - Nginx configuration parsing and management
- `sslService.js` - SSL certificate status checking
- `certbotService.js` - Let's Encrypt certificate operations

### 4. Public Directory (`public/`)
- `index.html` - Frontend HTML with Bootstrap and Socket.IO
- `app.js` - Complete frontend JavaScript application

## Quick Deployment Commands

```bash
# On your production server (sitedev.eezix.com)
cd /var/www/nginx-control-panel

# Pull latest changes from Git
git pull origin main

# Install any new dependencies
npm install

# Restart the application
pm2 restart ssl-manager
# OR if using systemd:
sudo systemctl restart nginx-control-panel

# Verify deployment
curl -X POST https://sitedev.eezix.com/api/nginx/validate-domain \
  -H "Content-Type: application/json" \
  -d '{"domain":"test.com"}'
```

## Expected Response After Deployment
```json
{"valid": true}
```

## Critical Fix
The main issue was that `routes/nginx-config.js` was missing from your production server, causing 404 errors on:
- `/api/nginx/validate-domain`
- `/api/nginx/add-domain`

This file contains all the nginx management routes that were working in development but missing in production.

## Production Configuration
The frontend is already configured to use your production server (`https://sitedev.eezix.com`) for all API calls and Socket.IO connections.

## File Verification Checklist
After deployment, verify these files exist on your production server:

```bash
# Check critical files exist
ls -la /var/www/nginx-control-panel/routes/nginx-config.js
ls -la /var/www/nginx-control-panel/routes/domains.js
ls -la /var/www/nginx-control-panel/routes/ssl.js
ls -la /var/www/nginx-control-panel/services/
ls -la /var/www/nginx-control-panel/public/
```

## Test Commands After Deployment
```bash
# Health check
curl https://sitedev.eezix.com/api/health

# Domain validation (should return {"valid": true})
curl -X POST https://sitedev.eezix.com/api/nginx/validate-domain \
  -H "Content-Type: application/json" \
  -d '{"domain":"example.com"}'

# Domain list
curl https://sitedev.eezix.com/api/domains
```

All files in this development environment are production-ready and configured for your server setup.