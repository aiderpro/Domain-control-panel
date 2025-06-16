# Domain Management Feature

## Overview

The SSL Certificate Manager now includes comprehensive domain management capabilities, allowing you to add new domains directly through the web interface. This feature automatically creates nginx configurations, enables sites, and prepares domains for SSL certificate installation.

## Features

### Domain Addition
- **Input Validation**: Comprehensive domain format validation including subdomains
- **Duplicate Detection**: Prevents adding domains that already exist
- **Real-time Feedback**: Live validation and progress updates
- **Automatic Configuration**: Creates complete nginx server blocks

### Nginx Integration
- **Document Root**: All domains use `/var/www/html` as document root
- **Security Headers**: Automatic security header configuration
- **PHP Support**: Ready for PHP processing with php8.1-fpm
- **Static File Optimization**: Built-in caching for static assets
- **Gzip Compression**: Automatic compression configuration

### Automatic Operations
- **Configuration Creation**: Generates complete nginx server blocks
- **Site Enabling**: Creates symbolic links in sites-enabled
- **Configuration Testing**: Validates nginx configuration before applying
- **Service Reload**: Automatically reloads nginx after successful addition

## Usage

### Adding a New Domain

1. **Access Interface**: Click "Add Domain" button in the domains list
2. **Enter Domain**: Type domain name (e.g., `example.com` or `subdomain.example.com`)
3. **Validation**: System validates domain format and checks for duplicates
4. **Automatic Setup**: System creates nginx configuration and enables the site
5. **Completion**: Domain appears in the list, ready for SSL certificate installation

### Supported Domain Formats

- **Root Domains**: `example.com`
- **Subdomains**: `www.example.com`, `api.example.com`, `blog.example.com`
- **Multi-level Subdomains**: `app.api.example.com`
- **Various TLDs**: `.com`, `.org`, `.net`, `.io`, `.dev`, etc.

### Domain Validation Rules

- Valid domain format (RFC compliant)
- Maximum length: 253 characters
- Minimum TLD length: 2 characters
- No protocol prefixes (http/https automatically stripped)
- No spaces or invalid characters

## Generated Nginx Configuration

Each domain gets a complete nginx server block with:

```nginx
server {
    listen 80;
    server_name domain.com;
    
    root /var/www/html;
    index index.html index.htm index.php;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    # PHP processing
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    }
    
    # Static file caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|pdf|txt)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Log files
    access_log /var/log/nginx/domain.com_access.log;
    error_log /var/log/nginx/domain.com_error.log;
}
```

## API Endpoints

### Add Domain
- **Endpoint**: `POST /api/nginx/add-domain`
- **Payload**: `{ "domain": "example.com" }`
- **Response**: Success/error status with details

### Validate Domain
- **Endpoint**: `POST /api/nginx/validate-domain`  
- **Payload**: `{ "domain": "example.com" }`
- **Response**: Validation result with error details

## Real-time Updates

The interface provides live feedback during domain addition:

1. **Validation**: Domain format checking
2. **Setup**: Document root preparation
3. **Configuration**: Nginx file creation
4. **Enabling**: Symbolic link creation
5. **Testing**: Configuration validation
6. **Reloading**: Nginx service reload

## Error Handling

### Common Errors and Solutions

- **Invalid Domain Format**: Check domain spelling and format
- **Domain Already Exists**: Use a different domain or remove existing configuration
- **Permission Errors**: Ensure proper file system permissions
- **Nginx Test Failure**: Check nginx syntax and conflicting configurations

### Troubleshooting

```bash
# Check nginx configuration
sudo nginx -t

# View nginx error logs
sudo tail -f /var/log/nginx/error.log

# Check domain configuration
sudo cat /etc/nginx/sites-available/domain.com

# Verify symbolic link
ls -la /etc/nginx/sites-enabled/domain.com
```

## Integration with SSL Management

After adding a domain:

1. Domain appears in the main list with "No SSL" status
2. "Install SSL" button becomes available
3. SSL certificate can be installed using Let's Encrypt
4. Domain automatically gets HTTPS configuration

## File Structure

```
/etc/nginx/sites-available/domain.com  # Configuration file
/etc/nginx/sites-enabled/domain.com    # Symbolic link
/var/www/html/                          # Document root
/var/log/nginx/domain.com_*.log         # Log files
```

## Security Considerations

- All domains use the same document root (`/var/www/html`)
- Security headers are automatically applied
- PHP processing is configured but requires php-fpm installation
- Log files are created for monitoring and debugging

## Future Enhancements

Planned improvements include:
- Custom document root specification
- Template selection for different site types
- Bulk domain addition
- Domain removal functionality
- Advanced nginx configuration options