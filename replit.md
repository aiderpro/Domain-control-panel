# SSL Certificate Manager

## Overview

This is a comprehensive SSL Certificate Management application built to simplify the process of managing SSL certificates for Nginx-hosted domains. The application provides a web-based interface for monitoring, installing, and renewing SSL certificates using Let's Encrypt through Certbot integration.

The system is designed as a full-stack application with a React frontend and Express.js backend, featuring real-time updates via Socket.IO for certificate operations. It automatically scans Nginx configurations to discover domains and provides detailed SSL status information for each.

## System Architecture

### Frontend Architecture
- **Framework**: React 19.1.0 with functional components and hooks
- **UI Framework**: Bootstrap 5.3.0 for responsive design
- **Icons**: Font Awesome 6.4.0 for consistent iconography
- **Real-time Communication**: Socket.IO client for live updates
- **HTTP Client**: Axios for API communication with interceptors for logging and error handling
- **Build System**: React Scripts 5.0.1 for development and production builds

### Backend Architecture
- **Runtime**: Node.js 20 with Express.js 5.1.0 framework
- **WebSocket Communication**: Socket.IO 4.8.1 for real-time updates during SSL operations
- **HTTP Client**: Axios for external API calls
- **CORS**: Enabled for cross-origin requests
- **Static File Serving**: Express serves React build files for production deployment

### Service Layer Architecture
The backend implements a service-oriented architecture with specialized services:
- **NginxService**: Parses and manages Nginx configurations
- **CertbotService**: Handles SSL certificate installation via Let's Encrypt
- **SSLService**: Monitors and validates SSL certificate status

## Key Components

### Frontend Components
1. **App.js**: Root component managing Socket.IO connection and global state
2. **Dashboard.js**: Main dashboard orchestrating domain management and SSL operations
3. **DomainList.js**: Table component displaying all discovered domains with SSL status
4. **SSLStatus.js**: Detailed view component showing certificate information for selected domains
5. **CertificateActions.js**: Action component for SSL installation, renewal, and management operations

### Backend Services
1. **NginxService**: Scans `/etc/nginx/sites-available` directory to discover domain configurations
2. **CertbotService**: Executes Certbot commands for SSL certificate lifecycle management
3. **SSLService**: Uses OpenSSL commands to validate certificate status and expiration dates

### API Routes
1. **Domains Route** (`/api/domains`): Provides domain discovery and SSL status information
2. **SSL Route** (`/api/ssl`): Handles certificate installation, renewal, and bulk operations
3. **Health Check** (`/api/health`): System status endpoint for monitoring

## Data Flow

### Domain Discovery Flow
1. Frontend requests domain list from `/api/domains`
2. NginxService scans Nginx configuration files
3. SSLService checks SSL status for each discovered domain
4. Combined data returns to frontend with SSL certificate details

### SSL Certificate Installation Flow
1. User initiates SSL installation through CertificateActions component
2. Frontend sends POST request to `/api/ssl/install` with domain and email
3. CertbotService spawns Certbot process with nginx verification
4. Real-time progress updates sent via Socket.IO
5. Success/failure notifications displayed in frontend
6. Domain list automatically refreshes upon completion

### Real-time Update Mechanism
- Socket.IO enables bidirectional communication between client and server
- SSL operations emit progress events: `ssl_install_progress`, `ssl_install_complete`, `ssl_install_error`
- Frontend subscribes to these events for live status updates
- Automatic domain list refresh triggered by completion events

## External Dependencies

### System Dependencies
- **Nginx**: Web server for hosting domains (configurations parsed from `/etc/nginx/sites-available`)
- **Certbot**: Let's Encrypt client for SSL certificate management
- **OpenSSL**: Certificate validation and status checking

### Development Dependencies
- **Bootstrap CDN**: UI framework loaded from jsdelivr CDN
- **Font Awesome CDN**: Icon library loaded from cdnjs CDN

### Runtime Dependencies
- **Express.js**: Web application framework
- **Socket.IO**: Real-time bidirectional event-based communication
- **Axios**: Promise-based HTTP client
- **CORS**: Cross-Origin Resource Sharing middleware
- **React**: Frontend library with DOM rendering

## Deployment Strategy

### Development Setup
- Replit environment configured for Node.js 20
- Package installation via npm with all required dependencies
- Server starts on port 8000 (configurable via PORT environment variable)
- Development server serves both API and React application

### Production Considerations
- React application builds to static files served by Express
- Environment variable `REACT_APP_API_URL` configures API endpoint
- Socket.IO configured with CORS for cross-origin connections
- Health check endpoint available for monitoring and load balancer integration

### File Structure
```
/
├── server.js (Express server entry point)
├── package.json (Node.js dependencies and scripts)
├── src/ (React frontend source)
├── services/ (Backend service layer)
├── routes/ (Express API routes)
└── public/ (Static assets and HTML template)
```

## Changelog

```
Changelog:
- June 16, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```