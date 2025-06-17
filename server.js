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
const sslRefreshRoutes = require('./routes/ssl-refresh');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? 
      ["https://cpanel.webeezix.in", "http://cpanel.webeezix.in", "https://sitedev.eezix.com", "http://sitedev.eezix.com"] : "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 8000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Authentication credentials
const AUTH_USER = 'adminssl';
const AUTH_PASSWORD = 'SSL@dm1n2025!#';

// Session configuration with memory store fallback
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'ssl-manager-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiration on activity
  cookie: {
    secure: NODE_ENV === 'production', // Enable secure cookies in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax' // 'none' for cross-site in production
  }
};

// Add session store for production
if (NODE_ENV === 'production') {
  // Use file-based session store for production persistence
  const FileStore = require('session-file-store')(session);
  sessionConfig.store = new FileStore({
    path: './sessions',
    ttl: 86400, // 24 hours
    retries: 5,
    logFn: function() {} // Silent logging
  });
}

app.use(session(sessionConfig));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8000',
      'https://sitedev.eezix.com',
      'https://cpanel.webeezix.in'
    ];

    // Check if origin matches or if it's a replit domain
    const isReplit = origin.includes('replit.dev') || origin.includes('repl.co');

    if (allowedOrigins.indexOf(origin) !== -1 || isReplit) {
      callback(null, true);
    } else {
      console.log(`CORS allowing origin: ${origin}`);
      callback(null, true); // Allow all origins for now to debug
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
};

// Middleware
app.use(cors(corsOptions));
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

  console.log('Login attempt:', {
    username: username,
    passwordLength: password ? password.length : 0,
    sessionId: req.sessionID,
    environment: NODE_ENV,
    origin: req.get('origin'),
    userAgent: req.get('user-agent')
  });

  if (username === AUTH_USER && password === AUTH_PASSWORD) {
    req.session.authenticated = true;
    req.session.user = username;

    console.log('Login successful for:', username);

    res.json({ 
      success: true, 
      message: 'Login successful',
      sessionId: req.sessionID,
      environment: NODE_ENV
    });
  } else {
    console.log('Login failed - invalid credentials');
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
  console.log('Auth status check:', {
    sessionId: req.sessionID,
    hasSession: !!req.session,
    authenticated: req.session?.authenticated,
    user: req.session?.user,
    environment: NODE_ENV,
    cookies: req.headers.cookie
  });

  if (req.session && req.session.authenticated) {
    res.json({ 
      authenticated: true, 
      user: req.session.user,
      sessionId: req.sessionID,
      environment: NODE_ENV
    });
  } else {
    res.json({ 
      authenticated: false,
      sessionId: req.sessionID,
      environment: NODE_ENV,
      hasSession: !!req.session
    });
  }
});

// Diagnostic endpoint for troubleshooting
app.get('/api/debug/session', (req, res) => {
  res.json({
    environment: NODE_ENV,
    sessionId: req.sessionID,
    hasSession: !!req.session,
    sessionData: req.session ? {
      authenticated: req.session.authenticated,
      user: req.session.user,
      cookie: req.session.cookie
    } : null,
    headers: {
      origin: req.get('origin'),
      userAgent: req.get('user-agent'),
      cookie: req.get('cookie'),
      host: req.get('host')
    },
    timestamp: new Date().toISOString()
  });
});

// Routes - Add middleware to pass io instance to routes
const addIoToReq = (req, res, next) => {
  req.io = io;
  next();
};

app.use('/api/domains', requireAuth, domainsRoutes);
app.use('/api/ssl', requireAuth, sslRoutes);
app.use('/api/ssl-refresh', requireAuth, sslRefreshRoutes);
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