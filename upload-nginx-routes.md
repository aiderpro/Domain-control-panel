# Quick Fix: Update Production Server

Your production server needs the updated domains.js file. Here's the fastest way to fix it:

## Method 1: Direct File Replacement

1. **SSH into your production server:**
   ```bash
   ssh user@sitedev.eezix.com
   ```

2. **Backup current file:**
   ```bash
   cd /var/www/nginx-control-panel/routes
   cp domains.js domains.js.backup
   ```

3. **Replace the file content:**
   ```bash
   nano domains.js
   ```
   
   Delete all content and paste the entire content from `production-domains.js` (the complete file I just created).

4. **Restart your service:**
   ```bash
   # Find your current process
   ps aux | grep node
   
   # Kill the old process (replace XXXX with the process ID)
   sudo kill XXXX
   
   # Start the service (choose one method)
   
   # Option A: Direct node
   cd /var/www/nginx-control-panel
   nohup node server.js > output.log 2>&1 &
   
   # Option B: PM2 (if installed)
   pm2 start server.js --name ssl-manager
   
   # Option C: Systemd (if set up)
   sudo systemctl restart nginx-control-panel
   ```

## Method 2: Complete Deployment

If you want the full setup, use the deployment package I created earlier.

## Test After Update

```bash
# Test domain validation (should work now)
curl -X POST https://sitedev.eezix.com/api/domains/validate \
     -H 'Content-Type: application/json' \
     -d '{"domain":"test.example.com"}'

# Expected response: {"valid":true,"domain":"test.example.com"}

# Test domain addition
curl -X POST https://sitedev.eezix.com/api/domains/add \
     -H 'Content-Type: application/json' \
     -d '{"domain":"test.example.com"}'
```

## Key Features Added

The updated domains.js includes:
- `POST /api/domains/validate` - Domain validation
- `POST /api/domains/add` - Automated nginx configuration creation
- Automatic nginx testing with `nginx -t`
- Automatic nginx reloading with `systemctl reload nginx`
- Document root set to `/var/www/html`
- Full error handling and logging

Once you update this file and restart your service, domain addition will work through the web interface.