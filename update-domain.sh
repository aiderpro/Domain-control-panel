#!/bin/bash

# SSL Manager - Domain Update Script
# This script updates the application for the new domain: cpanel.webeezix.in

echo "🔄 Updating SSL Manager for cpanel.webeezix.in..."

# Set production environment
export NODE_ENV=production

# Create sessions directory with proper permissions
echo "📁 Creating sessions directory..."
mkdir -p ./sessions
chmod 755 ./sessions

# Install required dependencies
echo "📦 Installing session-file-store dependency..."
npm install session-file-store

# Stop any running node processes
echo "🛑 Stopping existing processes..."
pkill -f "node server.js" || true
pkill -f "npm start" || true

# Wait a moment for processes to stop
sleep 2

# Start the application in production mode
echo "🚀 Starting SSL Manager in production mode..."
NODE_ENV=production nohup node server.js > ssl-manager.log 2>&1 &

# Get the process ID
sleep 2
PID=$(pgrep -f "node server.js")

if [ ! -z "$PID" ]; then
    echo "✅ SSL Manager started successfully (PID: $PID)"
    echo "📝 Logs: tail -f ssl-manager.log"
    echo "🌐 Access: https://cpanel.webeezix.in"
    echo ""
    echo "Login credentials:"
    echo "Username: adminssl"
    echo "Password: SSL@dm1n2025!#"
else
    echo "❌ Failed to start SSL Manager"
    echo "Check logs: cat ssl-manager.log"
    exit 1
fi

echo ""
echo "🔧 Configuration updated for:"
echo "- Domain: cpanel.webeezix.in"
echo "- CORS: Updated for new domain"
echo "- Sessions: File-based storage enabled"
echo "- Environment: Production mode"
echo ""
echo "If login issues persist, check:"
echo "1. HTTPS is properly configured"
echo "2. SSL certificate is valid"
echo "3. Firewall allows the application port"
echo "4. Sessions directory is writable"