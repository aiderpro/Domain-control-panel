#!/bin/bash

# Production SSL Fix Update Script
# Updates cpanel.webeezix.in with authentic SSL certificate data

echo "Creating complete production update package..."

# Create directory structure
mkdir -p ssl-production-fix/services
mkdir -p ssl-production-fix/routes

# Copy fixed files
cp services/sslService.js ssl-production-fix/services/
cp routes/ssl.js ssl-production-fix/routes/
cp routes/domains.js ssl-production-fix/routes/

# Create update script for production server
cat > ssl-production-fix/update-ssl-service.sh << 'EOF'
#!/bin/bash

echo "Updating SSL service on production server..."

# Backup current files
mkdir -p backup/$(date +%Y%m%d_%H%M%S)
cp services/sslService.js backup/$(date +%Y%m%d_%H%M%S)/sslService.js.backup 2>/dev/null || true
cp routes/ssl.js backup/$(date +%Y%m%d_%H%M%S)/ssl.js.backup 2>/dev/null || true
cp routes/domains.js backup/$(date +%Y%m%d_%H%M%S)/domains.js.backup 2>/dev/null || true

# Update files
cp services/sslService.js ./services/
cp routes/ssl.js ./routes/
cp routes/domains.js ./routes/

# Restart application
echo "Restarting SSL manager..."
pm2 restart ssl-manager 2>/dev/null || npm restart 2>/dev/null || node server.js &

echo "SSL service updated successfully!"
echo "Testing with a3cabscochin.com - should show July 23, 2025 instead of September 15th"

sleep 3
curl -s "http://localhost:8000/api/domains" | grep -A5 "a3cabscochin" 2>/dev/null || echo "Server restarting..."

EOF

chmod +x ssl-production-fix/update-ssl-service.sh

# Create deployment package
tar -czf ssl-production-fix.tar.gz ssl-production-fix/

echo "Production update package created: ssl-production-fix.tar.gz"
echo ""
echo "DEPLOYMENT INSTRUCTIONS:"
echo "1. Upload ssl-production-fix.tar.gz to your production server"
echo "2. Extract: tar -xzf ssl-production-fix.tar.gz"
echo "3. Run: cd ssl-production-fix && ./update-ssl-service.sh"
echo ""
echo "This will fix the SSL expiry dates to show real certificate information"
echo "instead of the hardcoded September 15th demo data."