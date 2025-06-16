const express = require('express');
const cors = require('cors');
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

// Middleware
app.use(cors());
app.use(express.json());
// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/domains', domainsRoutes);
app.use('/api/ssl', sslRoutes);
app.use('/api/nginx', nginxConfigRoutes);
app.use('/api/autorenewal', autorenewalRoutes);
app.use('/api/cloudns', cloudnsConfigRoutes);

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
