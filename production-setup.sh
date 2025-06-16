#!/bin/bash

# Production Setup Script for SSL Certificate Manager
# Run this on your production server (sitedev.eezix.com)

echo "Setting up SSL Certificate Manager for Production..."

# Set production environment
export NODE_ENV=production
export PORT=8000

# Navigate to application directory
cd /var/www/nginx-control-panel

# Install production dependencies
echo "Installing production dependencies..."
npm install --production --silent

# Stop existing processes
echo "Stopping existing processes..."
pkill -f "node server.js" 2>/dev/null || true
pm2 stop nginx-control-panel 2>/dev/null || true

# Start with PM2 for production
echo "Starting application with PM2..."
pm2 start server.js --name nginx-control-panel --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup
pm2 startup

echo "Production setup complete!"
echo "Application running at: https://sitedev.eezix.com"
echo ""
echo "Management commands:"
echo "  pm2 status              - Check status"
echo "  pm2 logs nginx-control-panel  - View logs"
echo "  pm2 restart nginx-control-panel - Restart app"
echo "  pm2 stop nginx-control-panel    - Stop app"