# SSL Manager - Live Server Login Troubleshooting Guide

## Quick Diagnosis Steps

### 1. Check Environment Configuration
Ensure your live server has the correct environment variable:
```bash
export NODE_ENV=production
```

### 2. Verify HTTPS Configuration
The login system requires HTTPS on production servers. Ensure your live server:
- Has SSL certificate installed
- Redirects HTTP to HTTPS
- Serves the app over HTTPS

### 3. Check Session Storage
The updated code uses file-based session storage for production. Ensure:
```bash
# Create sessions directory with proper permissions
mkdir -p ./sessions
chmod 755 ./sessions
```

### 4. Test Login Credentials
Default credentials:
- Username: `adminssl`
- Password: `SSL@dm1n2025!#`

### 5. Debug Information
Access these URLs on your live server to get diagnostic information:

```
https://yourdomain.com/api/debug/session
https://yourdomain.com/api/auth/status
```

## Common Issues & Solutions

### Issue 1: CORS Errors
**Symptoms:** Login fails with CORS errors in browser console
**Solution:** Update your domain in the CORS configuration

### Issue 2: Session Not Persisting
**Symptoms:** Login succeeds but immediately logged out
**Solution:** 
- Check HTTPS configuration
- Verify sessions directory exists and is writable
- Ensure secure cookies work with your SSL setup

### Issue 3: 401 Unauthorized Errors
**Symptoms:** All API calls return 401 after login
**Solution:**
- Check session storage configuration
- Verify cookie settings match your domain setup

## Advanced Debugging

### Check Server Logs
Monitor your server logs for these messages:
```
Login attempt: {...}
Login successful for: adminssl
Auth status check: {...}
```

### Browser Console Debug
Open browser DevTools and check console for:
- Login attempt logs
- Session debug information
- CORS error messages

### Test Session Persistence
1. Login successfully
2. Access: `https://yourdomain.com/api/debug/session`
3. Verify session data is present

## Configuration Updates Made

The following changes were implemented to fix live server login issues:

1. **Production Session Configuration**
   - Enabled secure cookies for HTTPS
   - Added file-based session storage
   - Updated CORS for production domains

2. **Enhanced Debugging**
   - Added login attempt logging
   - Created session debug endpoint
   - Improved error reporting

3. **CORS Configuration**
   - Updated origin handling
   - Added proper headers for production

## Manual Configuration Steps

If you need to manually configure your live server:

1. **Install Dependencies**
```bash
npm install session-file-store
```

2. **Set Environment Variables**
```bash
export NODE_ENV=production
export SESSION_SECRET="your-secure-session-secret"
```

3. **Create Sessions Directory**
```bash
mkdir -p sessions
chmod 755 sessions
```

4. **Restart Your Application**
```bash
# Stop current process
pkill -f "node server.js"

# Start with production environment
NODE_ENV=production node server.js
```

## Verification Steps

After applying fixes:

1. **Test Login Flow**
   - Access login page over HTTPS
   - Enter credentials
   - Verify successful login and redirect

2. **Check Session Persistence**
   - Login successfully
   - Refresh page
   - Verify still logged in

3. **Test API Access**
   - Access main application
   - Verify domain list loads
   - Test SSL operations

## Emergency Recovery

If login completely fails:

1. **Temporary Access**
   - SSH into your server
   - Temporarily disable authentication middleware
   - Fix configuration issues
   - Re-enable authentication

2. **Reset Sessions**
```bash
rm -rf sessions/*
```

3. **Check File Permissions**
```bash
chown -R www-data:www-data /path/to/your/app
chmod -R 755 /path/to/your/app
```

## Contact Support

If issues persist after following this guide:
1. Check browser console for specific error messages
2. Review server logs for authentication errors
3. Verify HTTPS certificate is working correctly
4. Test with different browsers to rule out client-side issues