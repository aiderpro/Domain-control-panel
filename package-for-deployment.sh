#!/bin/bash

echo "=== SSL Certificate Manager - Production Deployment Package ==="
echo

# Create deployment directory
DEPLOY_DIR="ssl-manager-deployment"
mkdir -p $DEPLOY_DIR

# Copy essential files
echo "Packaging files for deployment..."

# Main application files
cp server.js $DEPLOY_DIR/
cp package.json $DEPLOY_DIR/
cp package-lock.json $DEPLOY_DIR/

# Copy all routes
cp -r routes $DEPLOY_DIR/

# Copy all services
cp -r services $DEPLOY_DIR/

# Copy public files
cp -r public $DEPLOY_DIR/

# Copy src files (React components)
cp -r src $DEPLOY_DIR/

# Copy deployment scripts
cp create-domain.sh $DEPLOY_DIR/
cp deploy-nginx-routes.sh $DEPLOY_DIR/
cp update-domains-route.sh $DEPLOY_DIR/

echo "✓ Files packaged in $DEPLOY_DIR/"

# Create production deployment script
cat > $DEPLOY_DIR/deploy-to-production.sh << 'EOF'
#!/bin/bash

echo "=== SSL Certificate Manager - Production Deployment ==="
echo

# Install dependencies
echo "1. Installing Node.js dependencies..."
npm install

# Set up systemd service
echo "2. Creating systemd service file..."
sudo tee /etc/systemd/system/nginx-control-panel.service > /dev/null << 'SERVICE_EOF'
[Unit]
Description=SSL Certificate Manager
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/nginx-control-panel
Environment=NODE_ENV=production
Environment=PORT=8000
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# Reload systemd and enable service
echo "3. Setting up systemd service..."
sudo systemctl daemon-reload
sudo systemctl enable nginx-control-panel.service

# Set proper permissions
echo "4. Setting file permissions..."
sudo chown -R www-data:www-data /var/www/nginx-control-panel
sudo chmod +x /var/www/nginx-control-panel/create-domain.sh

# Start the service
echo "5. Starting SSL Certificate Manager..."
sudo systemctl start nginx-control-panel.service

# Check status
echo "6. Checking service status..."
sudo systemctl status nginx-control-panel.service

echo
echo "✓ Deployment complete!"
echo "✓ Service: nginx-control-panel"
echo "✓ Status: sudo systemctl status nginx-control-panel"
echo "✓ Logs: sudo journalctl -u nginx-control-panel -f"
echo "✓ Restart: sudo systemctl restart nginx-control-panel"
echo
echo "Test the endpoints:"
echo "curl -X GET https://sitedev.eezix.com/api/domains"
echo "curl -X POST https://sitedev.eezix.com/api/domains/validate -H 'Content-Type: application/json' -d '{\"domain\":\"test.com\"}'"

EOF

chmod +x $DEPLOY_DIR/deploy-to-production.sh

# Create PM2 alternative deployment
cat > $DEPLOY_DIR/deploy-with-pm2.sh << 'EOF'
#!/bin/bash

echo "=== SSL Certificate Manager - PM2 Deployment ==="
echo

# Install dependencies
echo "1. Installing Node.js dependencies..."
npm install

# Install PM2 if not installed
if ! command -v pm2 &> /dev/null; then
    echo "2. Installing PM2..."
    sudo npm install -g pm2
fi

# Create PM2 ecosystem file
echo "3. Creating PM2 configuration..."
cat > ecosystem.config.js << 'PM2_EOF'
module.exports = {
  apps: [{
    name: 'ssl-manager',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 8000
    }
  }]
};
PM2_EOF

# Stop any existing process
echo "4. Stopping existing PM2 processes..."
pm2 delete ssl-manager 2>/dev/null || true

# Start with PM2
echo "5. Starting SSL Certificate Manager with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
echo "6. Saving PM2 configuration..."
pm2 save

# Set up PM2 startup
echo "7. Setting up PM2 startup..."
pm2 startup

# Set proper permissions
echo "8. Setting file permissions..."
sudo chown -R www-data:www-data /var/www/nginx-control-panel
sudo chmod +x /var/www/nginx-control-panel/create-domain.sh

# Show status
echo "9. Checking PM2 status..."
pm2 status

echo
echo "✓ Deployment complete!"
echo "✓ Process: ssl-manager"
echo "✓ Status: pm2 status"
echo "✓ Logs: pm2 logs ssl-manager"
echo "✓ Restart: pm2 restart ssl-manager"
echo
echo "Test the endpoints:"
echo "curl -X GET https://sitedev.eezix.com/api/domains"
echo "curl -X POST https://sitedev.eezix.com/api/domains/validate -H 'Content-Type: application/json' -d '{\"domain\":\"test.com\"}'"

EOF

chmod +x $DEPLOY_DIR/deploy-with-pm2.sh

echo "✓ Deployment package created: $DEPLOY_DIR/"
echo
echo "Files included:"
ls -la $DEPLOY_DIR/
echo
echo "=== Deployment Instructions ==="
echo "1. Copy the entire $DEPLOY_DIR/ folder to your server:"
echo "   scp -r $DEPLOY_DIR/ user@sitedev.eezix.com:/var/www/nginx-control-panel"
echo
echo "2. SSH into your server and run:"
echo "   cd /var/www/nginx-control-panel"
echo "   chmod +x deploy-to-production.sh"
echo "   sudo ./deploy-to-production.sh"
echo
echo "   OR if you prefer PM2:"
echo "   chmod +x deploy-with-pm2.sh"
echo "   ./deploy-with-pm2.sh"
echo
echo "3. Test the application:"
echo "   curl -X GET https://sitedev.eezix.com/api/domains"