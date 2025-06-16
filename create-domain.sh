#!/bin/bash

# Domain Creation Script for Production Server
# Run this on your production server to add domains manually

if [ $# -eq 0 ]; then
    echo "Usage: $0 <domain-name>"
    echo "Example: $0 example.com"
    exit 1
fi

DOMAIN=$1
CONFIG_FILE="/etc/nginx/sites-available/$DOMAIN"
ENABLED_FILE="/etc/nginx/sites-enabled/$DOMAIN"

echo "Creating nginx configuration for: $DOMAIN"

# Create nginx configuration
cat > "$CONFIG_FILE" << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    root /var/www/html;
    index index.html index.htm index.php;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss;
    
    location / {
        try_files \$uri \$uri/ =404;
    }
    
    # PHP processing (if needed)
    location ~ \.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    }
    
    # Static file caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|pdf|txt)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }
    
    # Log files
    access_log /var/log/nginx/${DOMAIN}_access.log;
    error_log /var/log/nginx/${DOMAIN}_error.log;
}
EOF

echo "✓ Created configuration file: $CONFIG_FILE"

# Enable site
if [ ! -L "$ENABLED_FILE" ]; then
    ln -s "$CONFIG_FILE" "$ENABLED_FILE"
    echo "✓ Enabled site: $ENABLED_FILE"
else
    echo "✓ Site already enabled: $ENABLED_FILE"
fi

# Test nginx configuration
echo "Testing nginx configuration..."
if nginx -t; then
    echo "✓ Nginx configuration test PASSED"
    
    # Reload nginx
    echo "Reloading nginx..."
    if systemctl reload nginx; then
        echo "✓ Nginx reloaded SUCCESSFULLY"
        echo
        echo "Domain $DOMAIN added successfully!"
        echo "Document root: /var/www/html"
        echo "Configuration: $CONFIG_FILE"
        echo "Enabled at: $ENABLED_FILE"
    else
        echo "✗ Failed to reload nginx"
        exit 1
    fi
else
    echo "✗ Nginx configuration test FAILED"
    echo "Removing configuration files..."
    rm -f "$CONFIG_FILE" "$ENABLED_FILE"
    exit 1
fi