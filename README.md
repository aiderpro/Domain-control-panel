# SSL Certificate Manager

A comprehensive web-based SSL certificate management system for Nginx-hosted domains. This application provides automated SSL certificate installation, renewal, and monitoring using Let's Encrypt through Certbot integration.

## Features

- **Domain Discovery**: Automatically scans Nginx configurations to discover domains
- **SSL Management**: Install, renew, and monitor SSL certificates via Let's Encrypt
- **Real-time Updates**: Live progress updates during certificate operations
- **Bulk Operations**: Handle 1000+ domains with pagination (25 per page)
- **Domain Addition**: Add new domains with automatic Nginx configuration
- **Certificate Monitoring**: Track expiration dates and renewal status
- **Production Ready**: Optimized for Ubuntu 24 server deployment

## System Requirements

- Ubuntu 24.04 LTS
- Node.js 20+
- Nginx
- Certbot (Let's Encrypt client)
- OpenSSL

## Installation

### 1. Clone Repository
```bash
cd /var/www/
git clone <your-repository-url> nginx-control-panel
cd nginx-control-panel
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
# Set production environment
export NODE_ENV=production
export PORT=8000
```

### 4. Set Permissions
```bash
sudo chown -R www-data:www-data /var/www/nginx-control-panel
sudo chmod -R 755 /var/www/nginx-control-panel
```

### 5. Configure Nginx Reverse Proxy
Create `/etc/nginx/sites-available/nginx-control-panel`:

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
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/nginx-control-panel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Start Application
```bash
# Using PM2 (recommended)
npm install -g pm2
pm2 start server.js --name "ssl-manager"
pm2 startup
pm2 save

# OR using systemd
sudo systemctl start nginx-control-panel
sudo systemctl enable nginx-control-panel
```

## API Endpoints

### Domain Management
- `GET /api/domains` - List all domains with SSL status
- `POST /api/nginx/add-domain` - Add new domain to Nginx
- `POST /api/nginx/validate-domain` - Validate domain format

### SSL Management  
- `POST /api/ssl/install` - Install SSL certificate
- `POST /api/ssl/renew` - Renew SSL certificate
- `POST /api/ssl/renew-all` - Renew all certificates

### System
- `GET /api/health` - Health check endpoint

## Configuration

### Environment Variables
- `NODE_ENV` - Set to 'production' for production deployment
- `PORT` - Server port (default: 8000)
- `NGINX_SITES_PATH` - Path to Nginx sites-available (default: /etc/nginx/sites-available)

### Document Root
All domains are configured with document root `/var/www/html` for consistent file serving.

## Deployment

1. **Update from Git:**
   ```bash
   cd /var/www/nginx-control-panel
   git pull origin main
   npm install
   ```

2. **Restart Services:**
   ```bash
   pm2 restart ssl-manager
   # OR
   sudo systemctl restart nginx-control-panel
   ```

3. **Verify Deployment:**
   ```bash
   curl -X GET https://sitedev.eezix.com/api/health
   curl -X POST https://sitedev.eezix.com/api/nginx/validate-domain \
     -H "Content-Type: application/json" \
     -d '{"domain":"example.com"}'
   ```

## Usage

1. **Access the Web Interface:**
   Navigate to `https://sitedev.eezix.com`

2. **Add New Domain:**
   - Click "Add Domain" button
   - Enter domain name
   - System validates and creates Nginx configuration

3. **Install SSL Certificate:**
   - Select domain from list
   - Click "Install SSL" in domain details
   - Enter email for Let's Encrypt registration
   - Monitor real-time installation progress

4. **Renew Certificates:**
   - Use individual "Renew" buttons for specific domains
   - Monitor certificate expiration dates in dashboard

## File Structure

```
/var/www/nginx-control-panel/
├── server.js              # Main Express server
├── package.json           # Node.js dependencies
├── routes/
│   ├── domains.js         # Domain management routes
│   ├── ssl.js            # SSL certificate routes
│   └── nginx-config.js   # Nginx configuration routes
├── services/
│   ├── nginxService.js   # Nginx configuration parsing
│   ├── sslService.js     # SSL status checking
│   └── certbotService.js # Let's Encrypt integration
└── public/
    ├── index.html        # Frontend HTML
    └── app.js           # Frontend JavaScript
```

## Troubleshooting

### Common Issues

1. **404 on nginx routes:**
   - Ensure `routes/nginx-config.js` exists
   - Restart the application

2. **Permission errors:**
   - Check file ownership: `sudo chown -R www-data:www-data /var/www/nginx-control-panel`

3. **Certbot failures:**
   - Verify domain DNS points to server
   - Check Nginx configuration syntax

4. **Socket.IO connection issues:**
   - Ensure WebSocket proxy headers in Nginx configuration
   - Check firewall settings

### Logs

```bash
# Application logs
pm2 logs ssl-manager

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# System logs
sudo journalctl -u nginx-control-panel -f
```

## Security

- All API endpoints use HTTPS in production
- CORS enabled for specified origins
- Certificate operations logged for audit trail
- Input validation on all domain operations

## License

MIT License - See LICENSE file for details

## Support

For issues and questions, check the troubleshooting section or review the application logs.