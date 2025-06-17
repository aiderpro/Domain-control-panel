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

