# SSL Certificate Manager

A comprehensive web-based tool for managing SSL certificates on nginx servers with automatic Let's Encrypt integration.

## Features

- **Domain Discovery**: Automatically scans nginx configurations to find all domains
- **SSL Status Monitoring**: Real-time checking of certificate status and expiry dates
- **Certificate Management**: Install and renew SSL certificates with Let's Encrypt
- **Bulk Operations**: Manage multiple domains efficiently with pagination and filtering
- **Real-time Updates**: Live progress tracking via WebSocket connections
- **Search & Filter**: Find domains quickly with advanced filtering options

## Quick Deployment

### Prerequisites
- Ubuntu 24 server with nginx installed
- Node.js 20+ installed
- Domain pointing to your server
- Root or sudo access

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/YOUR_USERNAME/ssl-certificate-manager.git
cd ssl-certificate-manager
```

2. **Run the deployment script:**
```bash
chmod +x deploy.sh
./deploy.sh
```

The script will automatically:
- Install dependencies
- Configure nginx proxy
- Set up systemd service
- Configure SSL certificate permissions
- Start the application

3. **Access the interface:**
- HTTP: `http://your-domain.com`
- HTTPS: `https://your-domain.com` (after SSL installation)

## Manual Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create `.env` file:
```bash
PORT=8000
NODE_ENV=production
NGINX_SITES_PATH=/etc/nginx/sites-available
LETSENCRYPT_PATH=/etc/letsencrypt/live
```

### 3. Configure Nginx
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 4. Start the Application
```bash
# Development
npm start

# Production with PM2
npm install -g pm2
pm2 start server.js --name ssl-manager
pm2 startup
pm2 save
```

## Usage

1. **Domain Management**: The application automatically discovers domains from nginx configurations
2. **SSL Installation**: Click "Install SSL" next to any domain without a certificate
3. **Certificate Renewal**: Use "Renew" buttons for existing certificates
4. **Monitoring**: View expiry dates and certificate status at a glance
5. **Search & Filter**: Use the search bar and filters to manage large numbers of domains

## API Endpoints

- `GET /api/domains` - List all domains with SSL status
- `POST /api/ssl/install` - Install SSL certificate for a domain
- `POST /api/ssl/renew` - Renew SSL certificate
- `POST /api/ssl/renew-all` - Renew all expiring certificates
- `GET /api/health` - Health check endpoint

## Architecture

### Frontend
- Vanilla JavaScript with Bootstrap 5
- Socket.IO for real-time updates
- Responsive design for desktop and mobile

### Backend
- Node.js with Express.js
- Socket.IO for WebSocket communication
- Modular service architecture

### Services
- **NginxService**: Parses nginx configurations
- **CertbotService**: Manages Let's Encrypt certificates
- **SSLService**: Monitors certificate status

## Security Considerations

- The application requires sudo access for certbot operations
- Only the www-data user can execute certificate commands
- All certificate operations are logged
- CORS is configured for production domains

## Troubleshooting

### Service Issues
```bash
# Check service status
sudo systemctl status ssl-manager

# View logs
sudo journalctl -u ssl-manager -f

# Restart service
sudo systemctl restart ssl-manager
```

### Permission Issues
```bash
# Fix ownership
sudo chown -R www-data:www-data /var/www/nginx-control-panel

# Check certbot permissions
sudo -u www-data certbot certificates
```

### Nginx Issues
```bash
# Test configuration
sudo nginx -t

# Reload configuration
sudo systemctl reload nginx
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the logs for error details