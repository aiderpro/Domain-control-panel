# CloudNS DNS SSL Installation Setup

## Overview

The SSL Manager now supports two installation methods:
1. **Nginx Method** (Default) - Uses web server verification
2. **DNS Method** - Uses DNS challenge verification with CloudNS.net

## CloudNS Configuration

To use DNS SSL installation, you need to configure CloudNS.net API credentials.

### Required Environment Variables

Add these environment variables to your system:

```bash
# CloudNS API Credentials
export CLOUDNS_AUTH_ID="your_auth_id"
export CLOUDNS_AUTH_PASSWORD="your_auth_password"

# Optional: For sub-users
export CLOUDNS_SUB_AUTH_ID="your_sub_auth_id"
```

### Getting CloudNS API Credentials

1. Log into your CloudNS.net account
2. Go to API settings
3. Generate API credentials:
   - Auth ID
   - Auth Password
4. For sub-users, get the Sub Auth ID

### Production Setup

For production deployment, add the environment variables to your server:

```bash
# Add to /etc/environment or ~/.bashrc
CLOUDNS_AUTH_ID=your_auth_id
CLOUDNS_AUTH_PASSWORD=your_auth_password
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