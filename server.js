const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const domainsRoutes = require('./routes/domains');
const sslRoutes = require('./routes/ssl');
const nginxConfigRoutes = require('./routes/nginx-config');
const autorenewalRoutes = require('./routes/autorenewal');
const cloudnsConfigRoutes = require('./routes/cloudns-config');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? 
      ["https://sitedev.eezix.com", "http://sitedev.eezix.com"] : "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Authentication credentials
const AUTH_USER = 'adminssl';
const AUTH_PASSWORD = 'SSL@dm1n2025!#';

// Session configuration
app.use(session({
  secret: 'ssl-manager-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 
    ["https://sitedev.eezix.com", "http://sitedev.eezix.com"] : 
    ["http://localhost:8000", "http://127.0.0.1:8000"],
  credentials: true
}));
app.use(express.json());

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  } else {
    return res.status(401).json({ error: 'Authentication required' });
  }
}

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Authentication routes (unprotected)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === AUTH_USER && password === AUTH_PASSWORD) {
    req.session.authenticated = true;
    req.session.user = username;
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
    } else {
      res.json({ success: true, message: 'Logout successful' });
    }
  });
});

app.get('/api/auth/status', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

// Protected API routes
app.use('/api/domains', requireAuth, domainsRoutes);
app.use('/api/ssl', requireAuth, sslRoutes);
app.use('/api/nginx', requireAuth, nginxConfigRoutes);
app.use('/api/autorenewal', requireAuth, autorenewalRoutes);
app.use('/api/cloudns', requireAuth, cloudnsConfigRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SSL Certificate Manager running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Access URL: ${NODE_ENV === 'production' ? 'https://sitedev.eezix.com' : `http://localhost:${PORT}`}`);
});

module.exports = { app, io };
