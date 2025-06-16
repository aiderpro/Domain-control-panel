import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Dashboard from './components/Dashboard';
import './styles/App.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:8000');
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnectionStatus('connected');
      setSocket(newSocket);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnectionStatus('disconnected');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setConnectionStatus('error');
    });

    // Listen for SSL operation updates
    newSocket.on('ssl_install_progress', (data) => {
      addNotification('info', `Installing SSL for ${data.domain}: ${data.message}`, false);
    });

    newSocket.on('ssl_install_complete', (data) => {
      addNotification('success', `SSL certificate installed successfully for ${data.domain}`, true);
    });

    newSocket.on('ssl_install_error', (data) => {
      addNotification('error', `SSL installation failed for ${data.domain}: ${data.error}`, true);
    });

    newSocket.on('ssl_renew_progress', (data) => {
      addNotification('info', `Renewing SSL for ${data.domain}: ${data.message}`, false);
    });

    newSocket.on('ssl_renew_complete', (data) => {
      addNotification('success', `SSL certificate renewed successfully for ${data.domain}`, true);
    });

    newSocket.on('ssl_renew_error', (data) => {
      addNotification('error', `SSL renewal failed for ${data.domain}: ${data.error}`, true);
    });

    newSocket.on('ssl_renew_all_progress', (data) => {
      addNotification('info', `Renewing all certificates: ${data.message}`, false);
    });

    newSocket.on('ssl_renew_all_complete', (data) => {
      addNotification('success', 'All SSL certificates renewed successfully', true);
    });

    newSocket.on('ssl_renew_all_error', (data) => {
      addNotification('error', `SSL renewal failed: ${data.error}`, true);
    });

    newSocket.on('domain_refresh_start', () => {
      addNotification('info', 'Refreshing domain list...', false);
    });

    newSocket.on('domain_refresh_complete', (data) => {
      addNotification('success', `Domain list refreshed. Found ${data.count} domains.`, true);
    });

    newSocket.on('domain_refresh_error', (data) => {
      addNotification('error', `Domain refresh failed: ${data.error}`, true);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const addNotification = (type, message, persistent = false) => {
    const notification = {
      id: Date.now() + Math.random(),
      type,
      message,
      timestamp: new Date(),
      persistent
    };

    setNotifications(prev => [...prev, notification]);

    // Auto-remove non-persistent notifications
    if (!persistent) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 5000);
    }
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getConnectionStatusBadge = () => {
    const statusConfig = {
      connecting: { class: 'bg-warning', text: 'Connecting...', icon: 'fas fa-spinner fa-spin' },
      connected: { class: 'bg-success', text: 'Connected', icon: 'fas fa-check-circle' },
      disconnected: { class: 'bg-danger', text: 'Disconnected', icon: 'fas fa-times-circle' },
      error: { class: 'bg-danger', text: 'Connection Error', icon: 'fas fa-exclamation-triangle' }
    };

    const config = statusConfig[connectionStatus] || statusConfig.error;

    return (
      <span className={`badge ${config.class} d-flex align-items-center gap-1`}>
        <i className={config.icon}></i>
        {config.text}
      </span>
    );
  };

  return (
    <div className="App">
      {/* Header */}
      <nav className="navbar navbar-dark bg-primary mb-4">
        <div className="container-fluid">
          <span className="navbar-brand mb-0 h1 d-flex align-items-center">
            <i className="fas fa-shield-alt me-2"></i>
            SSL Certificate Manager
          </span>
          <div className="d-flex align-items-center gap-3">
            {getConnectionStatusBadge()}
            <span className="text-light small">
              <i className="fas fa-clock me-1"></i>
              {new Date().toLocaleString()}
            </span>
          </div>
        </div>
      </nav>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="container-fluid mb-3">
          <div className="notification-container">
            {notifications.map(notification => (
              <div
                key={notification.id}
                className={`alert alert-${notification.type === 'error' ? 'danger' : notification.type} alert-dismissible fade show`}
                role="alert"
              >
                <div className="d-flex align-items-start">
                  <div className="flex-grow-1">
                    <strong>
                      {notification.type === 'success' && <i className="fas fa-check-circle me-1"></i>}
                      {notification.type === 'error' && <i className="fas fa-exclamation-triangle me-1"></i>}
                      {notification.type === 'info' && <i className="fas fa-info-circle me-1"></i>}
                    </strong>
                    {notification.message}
                    <small className="d-block text-muted mt-1">
                      {notification.timestamp.toLocaleTimeString()}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => removeNotification(notification.id)}
                    aria-label="Close"
                  ></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container-fluid">
        {connectionStatus === 'connected' ? (
          <Dashboard socket={socket} />
        ) : (
          <div className="text-center py-5">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <h4 className="text-muted">Connecting to SSL Management Server...</h4>
            <p className="text-muted">
              Please ensure the backend server is running and accessible.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-light mt-5 py-3">
        <div className="container-fluid text-center text-muted">
          <small>
            <i className="fas fa-lock me-1"></i>
            SSL Certificate Manager - Manage your nginx domains and SSL certificates
          </small>
        </div>
      </footer>
    </div>
  );
}

export default App;
