# SSL Certificate Name Mismatch Troubleshooting

## Issue: "None of the common names in the certificate match the name that was entered"

This error occurs when the SSL certificate was issued for a different domain name than what you're accessing. Here's how to diagnose and fix it:

## 1. Check Certificate Details

```bash
# Check what domains the certificate was issued for
sudo openssl x509 -in /etc/letsencrypt/live/ssltest.eezix.com/fullchain.pem -text -noout | grep -A 1 "Subject:"
sudo openssl x509 -in /etc/letsencrypt/live/ssltest.eezix.com/fullchain.pem -text -noout | grep -A 5 "Subject Alternative Name"

# Check certificate domains with certbot
sudo certbot certificates
```

## 2. Verify Domain in Nginx Configuration

```bash
# Check nginx configuration for the domain
sudo grep -r "ssltest.eezix.com" /etc/nginx/sites-available/
sudo grep -r "ssl_certificate" /etc/nginx/sites-available/ssltest.eezix.com

# View the complete configuration
sudo cat /etc/nginx/sites-available/ssltest.eezix.com
```

## 3. Common Causes and Fixes

### Cause 1: Certificate issued for wrong domain
**Check:** Certificate was issued for `www.ssltest.eezix.com` but you're accessing `ssltest.eezix.com`

**Fix:** Reissue certificate with both domains:
```bash
sudo certbot --nginx -d ssltest.eezix.com -d www.ssltest.eezix.com
```

### Cause 2: Nginx not updated after SSL installation
**Check:** Certificate exists but nginx still points to old certificate or wrong path

**Fix:** Update nginx configuration manually:
```nginx
server {
    listen 443 ssl;
    server_name ssltest.eezix.com;
    
    ssl_certificate /etc/letsencrypt/live/ssltest.eezix.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ssltest.eezix.com/privkey.pem;
    
    # Your other configuration...
}
```

### Cause 3: Multiple configurations conflict
**Check:** Multiple nginx files contain the same domain

**Fix:** Remove duplicate configurations:
```bash
sudo grep -r "ssltest.eezix.com" /etc/nginx/sites-enabled/
# Remove duplicates and keep only one configuration
```

## 4. Complete SSL Reinstallation

If the certificate name mismatch persists:

```bash
# Remove existing certificate
sudo certbot delete --cert-name ssltest.eezix.com

# Reinstall with proper domain verification
sudo certbot --nginx -d ssltest.eezix.com --email admin@eezix.com

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

## 5. Verify SSL Installation

```bash
# Test SSL certificate online
curl -I https://ssltest.eezix.com

# Check certificate details from command line
echo | openssl s_client -servername ssltest.eezix.com -connect ssltest.eezix.com:443 2>/dev/null | openssl x509 -noout -text | grep -A 1 "Subject:"
```

## 6. Using SSL Certificate Manager

After fixing the certificate, refresh the SSL Manager interface:

1. Click "Refresh" button in the interface
2. The domain should show correct SSL status
3. Certificate expiry date should be visible
4. Status should change to "Valid SSL"

## 7. Prevention

To prevent future name mismatch issues:

1. Always specify all domain variants when installing SSL:
   ```bash
   sudo certbot --nginx -d domain.com -d www.domain.com
   ```

2. Verify nginx configuration after SSL installation:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

3. Test the certificate immediately after installation:
   ```bash
   curl -I https://yourdomain.com
   ```

## 8. Emergency Manual Configuration

If certbot fails to update nginx automatically, manually add SSL configuration:

```nginx
server {
    listen 80;
    server_name ssltest.eezix.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ssltest.eezix.com;
    
    ssl_certificate /etc/letsencrypt/live/ssltest.eezix.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ssltest.eezix.com/privkey.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    
    # Your website configuration
    root /var/www/ssltest.eezix.com;
    index index.html index.php;
    
    location / {
        try_files $uri $uri/ =404;
    }
}
```

Remember to test and reload nginx after any manual changes:
```bash
sudo nginx -t && sudo systemctl reload nginx
```