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

