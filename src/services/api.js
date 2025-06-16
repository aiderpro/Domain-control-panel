import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000/api',
  timeout: 60000, // 60 seconds timeout for SSL operations
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    
    // Handle network errors
    if (!error.response) {
      throw new Error('Network error - please check if the server is running');
    }
    
    // Handle HTTP errors
    const status = error.response.status;
    const message = error.response.data?.message || error.message;
    
    switch (status) {
      case 400:
        throw new Error(`Bad Request: ${message}`);
      case 401:
        throw new Error('Unauthorized - check your credentials');
      case 403:
        throw new Error('Forbidden - insufficient permissions');
      case 404:
        throw new Error(`Not Found: ${message}`);
      case 500:
        throw new Error(`Server Error: ${message}`);
      case 503:
        throw new Error('Service Unavailable - server is temporarily down');
      default:
        throw new Error(`Error ${status}: ${message}`);
    }
  }
);

// API methods
const apiMethods = {
  // Health check
  healthCheck: () => api.get('/health'),

  // Domain management
  getDomains: () => api.get('/domains'),
  getDomain: (domain) => api.get(`/domains/${encodeURIComponent(domain)}`),
  refreshDomains: () => api.post('/domains/refresh'),

  // SSL management
  getSSLStatus: (domain) => api.get(`/ssl/status/${encodeURIComponent(domain)}`),
  installSSL: (domain, email) => api.post('/ssl/install', { domain, email }),
  renewSSL: (domain) => api.post('/ssl/renew', { domain }),
  renewAllSSL: () => api.post('/ssl/renew-all'),
  configureAutoRenew: (domain, enabled) => api.post('/ssl/auto-renew', { domain, enabled }),

  // Utility methods
  testConnection: async () => {
    try {
      await apiMethods.healthCheck();
      return { connected: true, timestamp: new Date().toISOString() };
    } catch (error) {
      return { 
        connected: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  },

  // Domain validation
  validateDomain: (domain) => {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  },

  // Email validation
  validateEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
};

export default apiMethods;
