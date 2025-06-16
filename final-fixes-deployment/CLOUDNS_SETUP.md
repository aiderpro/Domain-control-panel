# CloudNS DNS SSL Installation Setup

## Overview

The SSL Manager now supports two installation methods:
1. **Nginx Method** (Default) - Uses web server verification
2. **DNS Method** - Uses DNS challenge verification with CloudNS.net

## CloudNS Configuration

To use DNS SSL installation, you need to configure CloudNS.net API credentials in a hidden configuration file.

### Configuration File Setup

Create a hidden configuration file `.cloudns-config` in your project root directory:

```json
{
  "authId": "your_cloudns_auth_id",
  "authPassword": "your_cloudns_auth_password",
  "subAuthId": ""
}
```

**Note:** The file `.cloudns-config` should be placed in the same directory as your `server.js` file.

### Getting CloudNS API Credentials

1. Log into your CloudNS.net account
2. Go to API settings
3. Generate API credentials:
   - Auth ID
   - Auth Password
4. For sub-users, get the Sub Auth ID

### Production Setup

For production deployment, create the `.cloudns-config` file on your server:

```bash
# Create configuration file in your project directory
cd /var/www/nginx-control-panel
nano .cloudns-config
```

Copy the JSON configuration with your actual CloudNS credentials:
```json
{
  "authId": "your_actual_cloudns_auth_id",
  "authPassword": "your_actual_cloudns_password", 
  "subAuthId": ""
}
```

Save the file and restart your application:
```bash
pm2 restart nginx-control-panel
```

### How DNS Method Works

1. User selects "DNS Method (CloudNS)" from dropdown
2. Certbot creates DNS challenge
3. CloudNS API automatically creates TXT record
4. Let's Encrypt verifies DNS record
5. Certificate is issued and nginx is configured
6. TXT record is cleaned up

### Benefits of DNS Method

- Works even if domain doesn't point to server yet
- Can issue certificates for domains behind CDN/proxy
- No need for temporary server access
- More reliable for complex network setups

### Renewal Method Tracking

The system automatically tracks which method was used for initial installation:
- Nginx certificates are renewed using nginx method
- DNS certificates are renewed using DNS method
- Method information is stored in `data/ssl-methods.json`

## Testing

To test DNS functionality without CloudNS credentials, the system will show appropriate error messages and fall back gracefully.