# SSL Certificate Manager - Deployment Guide

## Prerequisites
- Ubuntu 24 server with nginx installed
- Node.js 20+ installed
- Domain: sitedev.eezix.com pointing to your server
- Root or sudo access for certbot and nginx operations

## Deployment Steps

### 1. Upload Files to Server
```bash
# Create application directory
sudo mkdir -p /var/www/nginx-control-panel
sudo chown $USER:$USER /var/www/nginx-control-panel

# Upload all project files to /var/www/nginx-control-panel/
# - server.js
# - package.json
# - routes/
# - services/
# - public/
# - src/ (if using React build)
```

### 2. Install Dependencies
```bash
cd /var/www/nginx-control-panel
npm install --production
```

### 3. Environment Configuration
Create `.env` file:
```bash
PORT=8000
NODE_ENV=production
NGINX_SITES_PATH=/etc/nginx/sites-available
LETSENCRYPT_PATH=/etc/letsencrypt/live
```

### 4. Install System Dependencies
```bash
# Install certbot if not already installed
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

# Ensure certbot is accessible
sudo ln -sf /usr/bin/certbot /usr/local/bin/certbot
```

### 5. Create Systemd Service
Create `/etc/systemd/system/ssl-manager.service`:
```ini
[Unit]
Description=SSL Certificate Manager
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/nginx-control-panel
Environment=NODE_ENV=production
Environment=PORT=8000
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 6. Configure Nginx
Create `/etc/nginx/sites-available/sitedev.eezix.com`:
```nginx
server {
    listen 80;
    server_name sitedev.eezix.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.IO support
    location /socket.io/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 7. Enable Site and Start Services
```bash
# Enable nginx site
sudo ln -s /etc/nginx/sites-available/sitedev.eezix.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Set proper permissions
sudo chown -R www-data:www-data /var/www/nginx-control-panel
sudo chmod +x /var/www/nginx-control-panel/server.js

# Start SSL Manager service
sudo systemctl daemon-reload
sudo systemctl enable ssl-manager
sudo systemctl start ssl-manager
sudo systemctl status ssl-manager
```

### 8. Install SSL for Management Interface
```bash
# Install SSL certificate for the management interface itself
sudo certbot --nginx -d sitedev.eezix.com
```

### 9. Security Considerations
```bash
# Ensure certbot can be run by www-data user
sudo visudo
# Add line: www-data ALL=(ALL) NOPASSWD: /usr/bin/certbot

# Create log directory
sudo mkdir -p /var/log/ssl-manager
sudo chown www-data:www-data /var/log/ssl-manager
```

## File Transfer Commands

If uploading from local machine:
```bash
# Create archive of project files
tar -czf ssl-manager.tar.gz server.js package.json routes/ services/ public/

# Upload to server
scp ssl-manager.tar.gz user@your-server:/tmp/

# On server, extract
cd /var/www/nginx-control-panel
sudo tar -xzf /tmp/ssl-manager.tar.gz --strip-components=0
```

## Verification

1. Check service status: `sudo systemctl status ssl-manager`
2. Check logs: `sudo journalctl -u ssl-manager -f`
3. Access interface: https://sitedev.eezix.com
4. Test SSL installation on a domain

## Troubleshooting

- Service won't start: Check logs with `sudo journalctl -u ssl-manager`
- Permission errors: Ensure www-data owns files and can run certbot
- Nginx errors: Check `sudo nginx -t` and nginx error logs
- Socket.IO issues: Verify proxy configuration for WebSocket upgrades