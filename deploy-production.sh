#!/bin/bash

# SSL Certificate Manager - Production Deployment Script
# This script deploys the application to production server

echo "🚀 Starting SSL Certificate Manager Production Deployment..."

# Configuration
PRODUCTION_SERVER="sitedev.eezix.com"
PRODUCTION_PATH="/var/www/nginx-control-panel"
SERVICE_NAME="nginx-control-panel"

echo "📋 Production Configuration:"
echo "   Server: $PRODUCTION_SERVER"
echo "   Path: $PRODUCTION_PATH"
echo "   Service: $SERVICE_NAME"
echo ""

# Copy updated files to production
echo "📁 Copying updated files to production..."

# Backend files
echo "   → Copying routes/domains.js..."
scp routes/domains.js root@$PRODUCTION_SERVER:$PRODUCTION_PATH/routes/

echo "   → Copying public/app.js..."
scp public/app.js root@$PRODUCTION_SERVER:$PRODUCTION_PATH/public/

echo "   → Copying server.js..."
scp server.js root@$PRODUCTION_SERVER:$PRODUCTION_PATH/

echo "   → Copying package.json..."
scp package.json root@$PRODUCTION_SERVER:$PRODUCTION_PATH/

# Service files
echo "   → Copying service files..."
scp services/*.js root@$PRODUCTION_SERVER:$PRODUCTION_PATH/services/

echo ""
echo "🔄 Restarting production services..."

# SSH into production server and restart services
ssh root@$PRODUCTION_SERVER << 'EOF'
cd /var/www/nginx-control-panel

echo "📦 Installing/updating dependencies..."
npm install --production

echo "🔧 Setting production environment..."
export NODE_ENV=production
export PORT=8000

echo "🛑 Stopping existing service..."
pm2 stop nginx-control-panel 2>/dev/null || echo "Service not running"

echo "🚀 Starting production service..."
pm2 start server.js --name nginx-control-panel --env production

echo "💾 Saving PM2 configuration..."
pm2 save

echo "✅ Production deployment complete!"
echo "🌐 Application available at: https://sitedev.eezix.com"

echo ""
echo "📊 Service Status:"
pm2 status nginx-control-panel

echo ""
echo "📋 Recent logs:"
pm2 logs nginx-control-panel --lines 10
EOF

echo ""
echo "🎉 Production deployment completed successfully!"
echo "🌐 Access your application at: https://$PRODUCTION_SERVER"
echo ""
echo "📝 Useful production commands:"
echo "   Check status: ssh root@$PRODUCTION_SERVER 'pm2 status'"
echo "   View logs: ssh root@$PRODUCTION_SERVER 'pm2 logs nginx-control-panel'"
echo "   Restart: ssh root@$PRODUCTION_SERVER 'pm2 restart nginx-control-panel'"