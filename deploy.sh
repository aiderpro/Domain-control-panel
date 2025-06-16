#!/bin/bash

# SSL Certificate Manager - Server Deployment Script
# Run this script on your Ubuntu 24 server

set -e

echo "🔒 SSL Certificate Manager Deployment Script"
echo "=============================================="

# Configuration
APP_DIR="/var/www/nginx-control-panel"
SERVICE_NAME="ssl-manager"
DOMAIN="sitedev.eezix.com"

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ This script should not be run as root. Please run as a regular user with sudo privileges."
   exit 1
fi

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# Copy files (assumes files are in current directory)
echo "📦 Copying application files..."
cp -r * $APP_DIR/
cd $APP_DIR

# Install dependencies
echo "📥 Installing Node.js dependencies..."
npm install --production

# Create environment file
echo "⚙️  Creating environment configuration..."
cat > .env << EOF
PORT=8000
NODE_ENV=production
NGINX_SITES_PATH=/etc/nginx/sites-available
LETSENCRYPT_PATH=/etc/letsencrypt/live
EOF

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "🔧 Installing certbot..."
    sudo apt update
    sudo apt install certbot python3-certbot-nginx -y
fi

# Create systemd service
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null << EOF
[Unit]
Description=SSL Certificate Manager
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=8000
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Create nginx configuration
echo "🌐 Creating nginx configuration..."
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null << 'EOF'
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
        proxy_read_timeout 86400;
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
EOF

# Enable nginx site
echo "🔗 Enabling nginx site..."
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Set proper permissions
echo "🔐 Setting permissions..."
sudo chown -R www-data:www-data $APP_DIR
sudo chmod +x $APP_DIR/server.js

# Configure sudo for certbot
echo "🔧 Configuring certbot permissions..."
if ! sudo grep -q "www-data ALL=(ALL) NOPASSWD: /usr/bin/certbot" /etc/sudoers; then
    echo "www-data ALL=(ALL) NOPASSWD: /usr/bin/certbot" | sudo tee -a /etc/sudoers
fi

# Create log directory
sudo mkdir -p /var/log/ssl-manager
sudo chown www-data:www-data /var/log/ssl-manager

# Start and enable service
echo "🚀 Starting SSL Manager service..."
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl start $SERVICE_NAME

# Check service status
echo "📊 Checking service status..."
if sudo systemctl is-active --quiet $SERVICE_NAME; then
    echo "✅ SSL Manager service is running"
else
    echo "❌ SSL Manager service failed to start"
    sudo systemctl status $SERVICE_NAME
    exit 1
fi

# Install SSL certificate
echo "🔒 Installing SSL certificate for management interface..."
read -p "Install SSL certificate for $DOMAIN? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN
fi

echo ""
echo "🎉 Deployment completed successfully!"
echo "=============================================="
echo "Access your SSL Certificate Manager at:"
echo "  HTTP:  http://$DOMAIN"
echo "  HTTPS: https://$DOMAIN"
echo ""
echo "Service management commands:"
echo "  Status: sudo systemctl status $SERVICE_NAME"
echo "  Logs:   sudo journalctl -u $SERVICE_NAME -f"
echo "  Restart: sudo systemctl restart $SERVICE_NAME"
echo ""
echo "The application will automatically scan /etc/nginx/sites-available"
echo "for domain configurations and provide SSL management capabilities."