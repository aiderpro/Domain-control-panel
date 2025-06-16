# Complete SSL Manager Project Files for Git Deployment

## Project Structure

```
ssl-manager/
├── server.js
├── package.json
├── package-lock.json
├── routes/
│   ├── domains.js
│   ├── ssl.js
│   └── nginx-config.js
├── services/
│   ├── nginxService.js
│   ├── sslService.js
│   └── certbotService.js
├── public/
│   ├── index.html
│   └── app.js
└── README.md
```

## Files to Update/Add in Git

### 1. server.js (Main Server File)
### 2. routes/nginx-config.js (Missing Nginx Routes)
### 3. routes/domains.js (Domain Management)
### 4. routes/ssl.js (SSL Management)
### 5. services/nginxService.js (Nginx Service)
### 6. services/sslService.js (SSL Service)
### 7. services/certbotService.js (Certbot Service)
### 8. public/index.html (Frontend HTML)
### 9. public/app.js (Frontend JavaScript)
### 10. package.json (Dependencies)

## Deployment Instructions

1. **Clone/Pull from Git on production server:**
   ```bash
   cd /var/www/
   git clone <your-repo-url> nginx-control-panel
   # OR if already exists:
   cd /var/www/nginx-control-panel
   git pull origin main
   ```

2. **Install dependencies:**
   ```bash
   cd /var/www/nginx-control-panel
   npm install
   ```

3. **Set correct permissions:**
   ```bash
   sudo chown -R www-data:www-data /var/www/nginx-control-panel
   sudo chmod -R 755 /var/www/nginx-control-panel
   ```

4. **Restart the server:**
   ```bash
   pm2 restart server.js
   # OR
   sudo systemctl restart nginx-control-panel
   ```

5. **Test the deployment:**
   ```bash
   curl -X POST https://sitedev.eezix.com/api/nginx/validate-domain \
     -H "Content-Type: application/json" \
     -d '{"domain":"test.com"}'
   ```

## Key Features Included

- ✅ Nginx domain scanning and management
- ✅ SSL certificate installation and renewal
- ✅ Real-time updates via Socket.IO
- ✅ Domain validation and addition
- ✅ Pagination for 1000+ domains
- ✅ Document root set to /var/www/html
- ✅ Production-ready configuration