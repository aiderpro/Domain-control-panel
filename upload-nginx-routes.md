# Upload Missing Nginx Routes to Production Server

## Problem
The `/api/nginx/validate-domain` and `/api/nginx/add-domain` routes return 404 on your production server because the `routes/nginx-config.js` file is missing.

## Solution
Upload the `routes/nginx-config.js` file to your production server.

## Manual Upload Steps

1. **Download the nginx-config.js file from this development environment:**
   - Right-click on `routes/nginx-config.js` in the file tree
   - Save it to your computer

2. **Upload to your production server:**
   ```bash
   scp routes/nginx-config.js user@sitedev.eezix.com:/var/www/nginx-control-panel/routes/
   ```

3. **Restart your production server:**
   ```bash
   ssh user@sitedev.eezix.com
   cd /var/www/nginx-control-panel
   pm2 restart server.js
   # OR if using systemd:
   sudo systemctl restart nginx-control-panel
   ```

4. **Test the routes work:**
   ```bash
   curl -X POST https://sitedev.eezix.com/api/nginx/validate-domain \
     -H "Content-Type: application/json" \
     -d '{"domain":"test.com"}'
   ```
   Should return: `{"valid":true}`

## Alternative: Copy File Content

If you can't upload files directly, copy the content from `routes/nginx-config.js` and create the file manually on your production server:

```bash
ssh user@sitedev.eezix.com
cd /var/www/nginx-control-panel/routes
nano nginx-config.js
# Paste the entire content from routes/nginx-config.js
# Save and exit
```

## Routes That Will Be Added

- `POST /api/nginx/validate-domain` - Validates domain format
- `POST /api/nginx/add-domain` - Adds new domain to nginx
- `GET /api/nginx/test-config` - Tests nginx configuration
- `POST /api/nginx/reload-config` - Reloads nginx configuration

## Verification

After uploading and restarting, the domain addition feature should work correctly in the frontend.