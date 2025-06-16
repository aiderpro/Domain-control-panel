import React, { useState, useEffect } from 'react';
import DomainList from './DomainList';
import SSLStatus from './SSLStatus';
import CertificateActions from './CertificateActions';
import api from '../services/api';

function Dashboard({ socket }) {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    withSSL: 0,
    expiringSoon: 0,
    expired: 0
  });

  useEffect(() => {
    loadDomains();
  }, []);

  useEffect(() => {
    if (domains.length > 0) {
      calculateStats();
    }
  }, [domains]);

  // Socket event listeners for real-time updates
  useEffect(() => {
    if (socket) {
      socket.on('ssl_install_complete', () => {
        loadDomains(); // Refresh domains after SSL installation
      });

      socket.on('ssl_renew_complete', () => {
        loadDomains(); // Refresh domains after SSL renewal
      });

      socket.on('domain_refresh_start', () => {
        setRefreshing(true);
      });

      socket.on('domain_refresh_complete', () => {
        setRefreshing(false);
        loadDomains();
      });

      socket.on('domain_refresh_error', () => {
        setRefreshing(false);
      });

      return () => {
        socket.off('ssl_install_complete');
        socket.off('ssl_renew_complete');
        socket.off('domain_refresh_start');
        socket.off('domain_refresh_complete');
        socket.off('domain_refresh_error');
      };
    }
  }, [socket]);

  const loadDomains = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getDomains();
      setDomains(response.data.domains || []);
    } catch (err) {
      console.error('Error loading domains:', err);
      setError(err.response?.data?.message || 'Failed to load domains');
    } finally {
      setLoading(false);
    }
  };

  const refreshDomains = async () => {
    try {
      setRefreshing(true);
      await api.refreshDomains();
    } catch (err) {
      console.error('Error refreshing domains:', err);
      setError(err.response?.data?.message || 'Failed to refresh domains');
      setRefreshing(false);
    }
  };

  const calculateStats = () => {
    const total = domains.length;
    const withSSL = domains.filter(d => d.ssl?.hasSSL).length;
    const expiringSoon = domains.filter(d => 
      d.ssl?.hasSSL && d.ssl?.isExpiringSoon && !d.ssl?.isExpired
    ).length;
    const expired = domains.filter(d => 
      d.ssl?.hasSSL && d.ssl?.isExpired
    ).length;

    setStats({ total, withSSL, expiringSoon, expired });
  };

  const handleDomainSelect = (domain) => {
    setSelectedDomain(domain);
  };

  const handleSSLAction = async (action, domain, data) => {
    try {
      switch (action) {
        case 'install':
          await api.installSSL(domain, data.email);
          break;
        case 'renew':
          await api.renewSSL(domain);
          break;
        case 'renewAll':
          await api.renewAllSSL();
          break;
        default:
          throw new Error('Unknown SSL action');
      }
      
      // Domains will be refreshed via socket events
    } catch (err) {
      console.error(`Error performing SSL action ${action}:`, err);
      throw err;
    }
  };

  if (loading && domains.length === 0) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary mb-3" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <h4>Loading domains...</h4>
        <p className="text-muted">Scanning nginx configuration files...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Stats Overview */}
      <div className="row mb-4">
        <div className="col-md-3">
          <div className="card bg-primary text-white">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <h5 className="card-title">Total Domains</h5>
                  <h2 className="mb-0">{stats.total}</h2>
                </div>
                <div className="align-self-center">
                  <i className="fas fa-globe fa-2x"></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card bg-success text-white">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <h5 className="card-title">With SSL</h5>
                  <h2 className="mb-0">{stats.withSSL}</h2>
                </div>
                <div className="align-self-center">
                  <i className="fas fa-shield-alt fa-2x"></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card bg-warning text-white">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <h5 className="card-title">Expiring Soon</h5>
                  <h2 className="mb-0">{stats.expiringSoon}</h2>
                </div>
                <div className="align-self-center">
                  <i className="fas fa-exclamation-triangle fa-2x"></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card bg-danger text-white">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <h5 className="card-title">Expired</h5>
                  <h2 className="mb-0">{stats.expired}</h2>
                </div>
                <div className="align-self-center">
                  <i className="fas fa-times-circle fa-2x"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="row">
        {/* Domain List */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">
                <i className="fas fa-list me-2"></i>
                Domains
              </h5>
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={refreshDomains}
                disabled={refreshing}
              >
                {refreshing ? (
                  <>
                    <i className="fas fa-spinner fa-spin me-1"></i>
                    Refreshing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-sync-alt me-1"></i>
                    Refresh
                  </>
                )}
              </button>
            </div>
            <div className="card-body p-0">
              {error ? (
                <div className="alert alert-danger m-3" role="alert">
                  <i className="fas fa-exclamation-triangle me-2"></i>
                  {error}
                  <button
                    className="btn btn-outline-danger btn-sm ms-2"
                    onClick={loadDomains}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <DomainList
                  domains={domains}
                  onDomainSelect={handleDomainSelect}
                  selectedDomain={selectedDomain}
                  loading={loading}
                />
              )}
            </div>
          </div>
        </div>

        {/* SSL Status & Actions */}
        <div className="col-lg-4">
          {selectedDomain ? (
            <>
              <SSLStatus domain={selectedDomain} />
              <CertificateActions
                domain={selectedDomain}
                onSSLAction={handleSSLAction}
              />
            </>
          ) : (
            <div className="card">
              <div className="card-body text-center py-5">
                <i className="fas fa-mouse-pointer fa-3x text-muted mb-3"></i>
                <h5 className="text-muted">Select a Domain</h5>
                <p className="text-muted">
                  Click on a domain from the list to view SSL status and perform actions.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
