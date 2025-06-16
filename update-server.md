# Server Update Guide

## Quick Update Commands

### 1. Pull Latest Changes from GitHub
```bash
cd /var/www/nginx-control-panel
sudo git pull origin main
```

### 2. Install New Dependencies (if any)
```bash
sudo npm install --production
```

### 3. Fix Permissions
```bash
sudo chown -R www-data:www-data /var/www/nginx-control-panel
sudo chmod +x /var/www/nginx-control-panel/server.js
```

### 4. Restart the Service
```bash
sudo systemctl restart ssl-manager
```

### 5. Verify Everything is Working
```bash
# Check service status
sudo systemctl status ssl-manager

# Check if it's listening on port 8000
sudo netstat -tlnp | grep 8000

# Test the API
curl http://localhost:8000/api/health
```

## Complete Update Script

Create this script for easy updates:

```bash
sudo tee /usr/local/bin/update-ssl-manager << 'EOF'
#!/bin/bash
echo "🔄 Updating SSL Certificate Manager..."

# Navigate to app directory
cd /var/www/nginx-control-panel

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
sudo -u www-data git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
sudo npm install --production

# Fix permissions
echo "🔐 Setting correct permissions..."
sudo chown -R www-data:www-data .
sudo chmod +x server.js

# Restart service
echo "🔄 Restarting SSL Manager service..."
sudo systemctl restart ssl-manager

# Wait a moment for service to start
sleep 3

# Check status
echo "📊 Checking service status..."
if sudo systemctl is-active --quiet ssl-manager; then
    echo "✅ SSL Manager updated and running successfully"
    echo "🌐 Access at: https://sitedev.eezix.com"
else
    echo "❌ Service failed to start. Check logs:"
    sudo journalctl -u ssl-manager --no-pager -n 10
fi
EOF

# Make script executable
sudo chmod +x /usr/local/bin/update-ssl-manager
```

## Using the Update Script

After creating the script, you can update with a single command:
```bash
sudo update-ssl-manager
```

## Manual Step-by-Step Process

If you prefer manual updates:

```bash
# 1. Stop the service
sudo systemctl stop ssl-manager

# 2. Navigate to app directory
cd /var/www/nginx-control-panel

# 3. Check current status
git status
git log --oneline -5

# 4. Pull updates
sudo git pull origin main

# 5. Check what changed
git log --oneline -5

# 6. Install any new dependencies
sudo npm install --production

# 7. Fix ownership and permissions
sudo chown -R www-data:www-data .
sudo chmod +x server.js

# 8. Test configuration (if applicable)
# sudo nginx -t

# 9. Start the service
sudo systemctl start ssl-manager

# 10. Verify it's working
sudo systemctl status ssl-manager
curl -I https://sitedev.eezix.com
```

## Troubleshooting Updates

### If Git Pull Fails
```bash
# Check for local changes
git status

# If there are local modifications, stash them
sudo git stash

# Then pull updates
sudo git pull origin main

# Apply stashed changes if needed
sudo git stash pop
```

### If Service Won't Start After Update
```bash
# Check detailed logs
sudo journalctl -u ssl-manager -f

# Check for missing dependencies
npm audit

# Reinstall dependencies completely
sudo rm -rf node_modules package-lock.json
sudo npm install --production
```

### If Permissions are Wrong
```bash
sudo chown -R www-data:www-data /var/www/nginx-control-panel
sudo chmod +x /var/www/nginx-control-panel/server.js
sudo chmod 755 /var/www/nginx-control-panel
```

## Update Notifications

To get notified when updates are available:

```bash
# Create a daily check script
sudo tee /etc/cron.daily/check-ssl-manager-updates << 'EOF'
#!/bin/bash
cd /var/www/nginx-control-panel
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git ls-remote origin main | cut -f1)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "SSL Manager updates available. Run: sudo update-ssl-manager" | wall
fi
EOF

sudo chmod +x /etc/cron.daily/check-ssl-manager-updates
```

## Rollback if Needed

If an update causes issues:

```bash
# Check recent commits
git log --oneline -10

# Rollback to previous version
sudo git reset --hard HEAD~1

# Restart service
sudo systemctl restart ssl-manager
```

## Best Practices

1. **Always backup before major updates**
2. **Test updates on a staging server first** 
3. **Monitor logs after updates**
4. **Keep a rollback plan ready**
5. **Update during low-traffic periods**