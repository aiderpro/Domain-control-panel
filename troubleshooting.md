# SSL Certificate Manager - Troubleshooting Guide

## Socket.IO Connection Error: "server error"

This error indicates the frontend cannot establish a WebSocket connection to the backend. Here are the steps to diagnose and fix:

### 1. Check Service Status

```bash
# Check if SSL Manager service is running
sudo systemctl status ssl-manager

# If not running, start it
sudo systemctl start ssl-manager

# Check service logs
sudo journalctl -u ssl-manager -f
```

### 2. Verify Port and Process

```bash
# Check if application is listening on port 8000
sudo netstat -tlnp | grep 8000
# or
sudo ss -tlnp | grep 8000

# Check process
ps aux | grep node
```

### 3. Test Backend API Directly

```bash
# Test if backend responds
curl -I http://localhost:8000/api/health

# Test domains endpoint
curl http://localhost:8000/api/domains
```

### 4. Check Nginx Configuration

```bash
# Test nginx configuration
sudo nginx -t

# Check nginx error logs
sudo tail -f /var/log/nginx/error.log

# Reload nginx if needed
sudo systemctl reload nginx
```

### 5. Firewall and Network

```bash
# Check if port 8000 is accessible
sudo ufw status

# Allow port if blocked
sudo ufw allow 8000

# Test local connection
telnet localhost 8000
```

### 6. Common Fixes

#### Fix 1: Restart Services
```bash
sudo systemctl restart ssl-manager
sudo systemctl restart nginx
```

#### Fix 2: Check File Permissions
```bash
sudo chown -R www-data:www-data /var/www/nginx-control-panel
sudo chmod +x /var/www/nginx-control-panel/server.js
```

#### Fix 3: Update Nginx Configuration
Ensure your nginx config includes WebSocket support:

```nginx
location /socket.io/ {
    proxy_pass http://localhost:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

#### Fix 4: Check Node.js Version
```bash
node --version
# Should be 20+
```

### 7. Environment Variables

Create or check `/var/www/nginx-control-panel/.env`:
```bash
PORT=8000
NODE_ENV=production
NGINX_SITES_PATH=/etc/nginx/sites-available
LETSENCRYPT_PATH=/etc/letsencrypt/live
```

### 8. Manual Testing

Start the application manually to see errors:
```bash
cd /var/www/nginx-control-panel
sudo -u www-data NODE_ENV=production node server.js
```

### 9. Debugging Steps

Add these checks:

1. **Check browser console for more details**
2. **Verify domain DNS resolution**
3. **Test from different browser/device**
4. **Check server timezone/clock**

### 10. Complete Reset

If all else fails:
```bash
# Stop service
sudo systemctl stop ssl-manager

# Update code
cd /var/www/nginx-control-panel
sudo git pull origin main

# Reinstall dependencies
sudo npm install --production

# Fix permissions
sudo chown -R www-data:www-data .
sudo chmod +x server.js

# Start service
sudo systemctl start ssl-manager
```

## Quick Diagnostic Script

Run this script to gather diagnostic information:

```bash
#!/bin/bash
echo "=== SSL Manager Diagnostics ==="
echo "Service Status:"
sudo systemctl status ssl-manager --no-pager
echo -e "\nPort Check:"
sudo netstat -tlnp | grep 8000
echo -e "\nNginx Status:"
sudo nginx -t
echo -e "\nAPI Test:"
curl -s -I http://localhost:8000/api/health
echo -e "\nLast 10 service logs:"
sudo journalctl -u ssl-manager -n 10 --no-pager
```

## Expected Success Indicators

When working correctly, you should see:
- Service status: "active (running)"
- Port 8000 listening with node process
- API responds with HTTP 200
- Frontend shows "Connected" status
- No errors in browser console