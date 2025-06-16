# SSL Certificate Manager - Production Deployment Guide

## Quick Setup (Choose One Method)

### Method 1: Using Systemd Service (Recommended)

1. **Upload files to your server:**
   ```bash
   # Download the deployment package
   wget https://your-replit-url/ssl-manager-deployment.tar.gz
   # OR upload manually
   
   # Extract to production directory
   cd /var/www
   sudo tar -xzf ssl-manager-deployment.tar.gz
   sudo mv ssl-manager-deployment nginx-control-panel
   ```

2. **Run the deployment script:**
   ```bash
   cd /var/www/nginx-control-panel
   sudo chmod +x deploy-to-production.sh
   sudo ./deploy-to-production.sh
   ```

3. **Your service is now running as:**
   - Service name: `nginx-control-panel`
   - Port: 8000
   - Auto-starts on boot

### Method 2: Using PM2 Process Manager

1. **Upload and extract files** (same as above)

2. **Run PM2 deployment:**
   ```bash
   cd /var/www/nginx-control-panel
   chmod +x deploy-with-pm2.sh
   ./deploy-with-pm2.sh
   ```

3. **Your process is now running as:**
   - Process name: `ssl-manager`
   - Managed by PM2
   - Auto-restart enabled

## Service Management Commands

### For Systemd:
```bash
# Check status
sudo systemctl status nginx-control-panel

# Start/stop/restart
sudo systemctl start nginx-control-panel
sudo systemctl stop nginx-control-panel
sudo systemctl restart nginx-control-panel

# View logs
sudo journalctl -u nginx-control-panel -f
```

### For PM2:
```bash
# Check status
pm2 status

# Start/stop/restart
pm2 start ssl-manager
pm2 stop ssl-manager
pm2 restart ssl-manager

# View logs
pm2 logs ssl-manager
```

## Test Your Installation

After deployment, test these endpoints:

```bash
# Test domain listing
curl -X GET https://sitedev.eezix.com/api/domains

# Test domain validation
curl -X POST https://sitedev.eezix.com/api/domains/validate \
     -H 'Content-Type: application/json' \
     -d '{"domain":"test.example.com"}'

# Test domain addition (creates real nginx config)
curl -X POST https://sitedev.eezix.com/api/domains/add \
     -H 'Content-Type: application/json' \
     -d '{"domain":"test.example.com"}'
```

## Web Interface

Access your SSL Certificate Manager at:
- **URL:** https://sitedev.eezix.com
- **Features:** Domain listing, SSL status, domain addition, certificate management

## File Locations

```
/var/www/nginx-control-panel/
├── server.js                    # Main application
├── routes/domains.js           # Domain management API
├── routes/ssl.js              # SSL certificate API  
├── services/                  # Backend services
├── public/                    # Frontend files
├── create-domain.sh          # Manual domain creation script
└── deploy-*.sh               # Deployment scripts
```

## Troubleshooting

### Service won't start:
```bash
# Check Node.js version
node --version  # Should be 18+ 

# Check permissions
sudo chown -R www-data:www-data /var/www/nginx-control-panel

# Check logs for errors
sudo journalctl -u nginx-control-panel -n 50
```

### Domain addition fails:
```bash
# Check nginx permissions
sudo chown -R www-data:www-data /var/www/html
sudo chmod 755 /var/www/html

# Test nginx configuration manually
sudo nginx -t

# Check if directories exist
ls -la /etc/nginx/sites-available/
ls -la /etc/nginx/sites-enabled/
```

### API returns 404:
- Service might not be running
- Check if it's listening on port 8000
- Verify nginx proxy configuration

## Manual Domain Creation

If the web interface isn't working, use the manual script:

```bash
cd /var/www/nginx-control-panel
sudo chmod +x create-domain.sh
sudo ./create-domain.sh your-domain.com
```

This script:
- Creates nginx configuration file
- Sets document root to /var/www/html
- Enables the site
- Tests nginx configuration
- Reloads nginx

## Success Verification

Your deployment is successful when:
1. `curl -X GET https://sitedev.eezix.com/api/domains` returns domain list
2. Web interface loads at https://sitedev.eezix.com
3. You can add domains through the web interface
4. New domains appear in `/etc/nginx/sites-available/`
5. SSL installation works for your domains

The domain addition feature will be fully functional once deployed!