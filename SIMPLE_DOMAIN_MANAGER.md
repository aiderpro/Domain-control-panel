# Simple Domain Manager

A lightweight domain management system focused on adding and deleting domains with SSL certificate support.

## Features

- **Add Domains**: Create nginx configurations for new domains
- **Delete Domains**: Remove domains and their SSL certificates
- **SSL Management**: Install and remove Let's Encrypt SSL certificates
- **Simple Interface**: Clean web interface for domain operations

## API Endpoints

### Authentication
```bash
POST /api/login
Content-Type: application/json

{
  "username": "admin",
  "password": "domain2025"
}
```

### Domain Operations

#### Get All Domains
```bash
GET /api/domains
Authorization: YOUR_TOKEN
```

#### Add New Domain
```bash
POST /api/domains
Authorization: YOUR_TOKEN
Content-Type: application/json

{
  "domain": "example.com",
  "installSSL": true,
  "email": "admin@example.com"
}
```

#### Delete Domain
```bash
DELETE /api/domains/example.com?removeSSL=true
Authorization: YOUR_TOKEN
```

### SSL Operations

#### Install SSL Certificate
```bash
POST /api/domains/example.com/ssl
Authorization: YOUR_TOKEN
Content-Type: application/json

{
  "email": "admin@example.com"
}
```

#### Remove SSL Certificate
```bash
DELETE /api/domains/example.com/ssl
Authorization: YOUR_TOKEN
```

## Installation

### 1. Server Requirements
- Ubuntu/Debian server with nginx
- Node.js 18+ installed
- Certbot for SSL certificates
- Sudo access for nginx configuration

### 2. Install Dependencies
```bash
npm install express cors
```

### 3. Setup Nginx
```bash
# Ensure nginx is installed and running
sudo systemctl enable nginx
sudo systemctl start nginx

# Create web root directory
sudo mkdir -p /var/www/html
sudo chown -R www-data:www-data /var/www/html
```

### 4. Install Certbot
```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx

# Verify installation
certbot --version
```

### 5. Start the Application
```bash
node simple-domain-manager.js
```

The application will be available at `http://your-server:3001`

## Usage

### Adding a Domain

1. **Access the interface** at `http://your-server:3001`
2. **Login** with username `admin` and password `domain2025`
3. **Enter domain name** (e.g., `example.com`)
4. **Optional**: Check "Install SSL Certificate" and enter email
5. **Click "Add Domain"**

The system will:
- Create nginx configuration for `domain.com` and `www.domain.com`
- Enable the site in nginx
- Test and reload nginx configuration
- Install SSL certificate if requested

### Deleting a Domain

1. **Find the domain** in the domains list
2. **Click "Delete"** button
3. **Confirm deletion**

The system will:
- Remove SSL certificate if present
- Delete nginx configuration files
- Remove site from enabled sites
- Test and reload nginx configuration

### SSL Management

#### Install SSL for Existing Domain
1. **Find domain** without SSL in the list
2. **Click "Install SSL"**
3. **Enter email address** when prompted

#### Remove SSL Certificate
1. **Find domain** with SSL in the list
2. **Click "Remove SSL"**
3. **Confirm removal**

## Nginx Configuration Template

Each domain gets this nginx configuration:

```nginx
server {
    listen 80;
    server_name domain.com www.domain.com;
    
    root /var/www/html;
    index index.html index.htm index.php;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    }
    
    location ~ /\.ht {
        deny all;
    }
}
```

When SSL is installed, Certbot automatically adds HTTPS configuration.

## Security

- **Authentication required** for all domain operations
- **Domain validation** prevents invalid domain names
- **Nginx configuration testing** before applying changes
- **SSL certificates** use Let's Encrypt with proper validation

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Ensure the application runs with sufficient privileges to modify nginx configs
   - Check sudo permissions for nginx operations

2. **Nginx Test Failed**
   - Check nginx configuration syntax
   - Verify domain name format
   - Ensure no conflicting configurations

3. **SSL Installation Failed**
   - Verify domain points to your server
   - Check Certbot installation
   - Ensure port 80 and 443 are open

4. **Domain Already Exists**
   - Check existing nginx configurations
   - Remove conflicting configurations manually if needed

### Log Files

- **Application logs**: Console output
- **Nginx logs**: `/var/log/nginx/error.log`
- **Certbot logs**: `/var/log/letsencrypt/letsencrypt.log`

## File Structure

```
simple-domain-manager.js         # Main server application
public/simple-domains.html       # Web interface
SIMPLE_DOMAIN_MANAGER.md        # This documentation
```

## Differences from Full SSL Manager

This simplified version:
- **No database required** - reads directly from nginx configurations
- **No SSL monitoring** - focuses on installation/removal only
- **Simpler interface** - streamlined for basic operations
- **Lightweight** - minimal dependencies and complexity

Perfect for basic domain management without advanced SSL monitoring features.