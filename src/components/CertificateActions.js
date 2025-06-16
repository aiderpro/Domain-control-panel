import React, { useState } from 'react';

function CertificateActions({ domain, onSSLAction }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [showInstallForm, setShowInstallForm] = useState(false);
  const [error, setError] = useState(null);

  const handleInstallSSL = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Email address is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSSLAction('install', domain.domain, { email });
      setShowInstallForm(false);
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to install SSL certificate');
    } finally {
      setLoading(false);
    }
  };

  const handleRenewSSL = async () => {
    try {
      setLoading(true);
      setError(null);
      await onSSLAction('renew', domain.domain);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to renew SSL certificate');
    } finally {
      setLoading(false);
    }
  };

  const handleRenewAllSSL = async () => {
    try {
      setLoading(true);
      setError(null);
      await onSSLAction('renewAll');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to renew all SSL certificates');
    } finally {
      setLoading(false);
    }
  };

  const ssl = domain.ssl;
  const hasSSL = ssl?.hasSSL;
  const canRenew = hasSSL && !ssl?.error;

  return (
    <div className="card">
      <div className="card-header">
        <h6 className="mb-0">
          <i className="fas fa-tools me-2"></i>
          Certificate Actions
        </h6>
      </div>
      <div className="card-body">
        {error && (
          <div className="alert alert-danger alert-dismissible fade show" role="alert">
            <i className="fas fa-exclamation-triangle me-2"></i>
            {error}
            <button
              type="button"
              className="btn-close"
              onClick={() => setError(null)}
              aria-label="Close"
            ></button>
          </div>
        )}

        {!hasSSL && (
          <div className="mb-3">
            <h6 className="text-muted mb-2">Install SSL Certificate</h6>
            {!showInstallForm ? (
              <button
                className="btn btn-success w-100"
                onClick={() => setShowInstallForm(true)}
                disabled={loading}
              >
                <i className="fas fa-plus me-2"></i>
                Install SSL Certificate
              </button>
            ) : (
              <form onSubmit={handleInstallSSL}>
                <div className="mb-3">
                  <label htmlFor="email" className="form-label">
                    Email Address <span className="text-danger">*</span>
                  </label>
                  <input
                    type="email"
                    className="form-control"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    required
                    disabled={loading}
                  />
                  <div className="form-text">
                    Required for Let's Encrypt certificate registration and notifications.
                  </div>
                </div>

                <div className="d-grid gap-2">
                  <button
                    type="submit"
                    className="btn btn-success"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <i className="fas fa-spinner fa-spin me-2"></i>
                        Installing...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-download me-2"></i>
                        Install Certificate
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setShowInstallForm(false);
                      setEmail('');
                      setError(null);
                    }}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {hasSSL && (
          <div className="mb-3">
            <h6 className="text-muted mb-2">Manage Certificate</h6>
            <div className="d-grid gap-2">
              <button
                className="btn btn-primary"
                onClick={handleRenewSSL}
                disabled={loading || !canRenew}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin me-2"></i>
                    Renewing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-sync-alt me-2"></i>
                    Renew Certificate
                  </>
                )}
              </button>

              {ssl?.isExpired && (
                <div className="alert alert-warning p-2 mt-2" role="alert">
                  <small>
                    <i className="fas fa-info-circle me-1"></i>
                    This certificate has expired. Renewal is recommended.
                  </small>
                </div>
              )}

              {ssl?.isExpiringSoon && !ssl?.isExpired && (
                <div className="alert alert-info p-2 mt-2" role="alert">
                  <small>
                    <i className="fas fa-info-circle me-1"></i>
                    This certificate expires in {ssl.daysUntilExpiry} days. Consider renewing soon.
                  </small>
                </div>
              )}
            </div>
          </div>
        )}

        <hr />

        <div className="mb-3">
          <h6 className="text-muted mb-2">Bulk Actions</h6>
          <div className="d-grid">
            <button
              className="btn btn-outline-primary"
              onClick={handleRenewAllSSL}
              disabled={loading}
            >
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin me-2"></i>
                  Renewing All...
                </>
              ) : (
                <>
                  <i className="fas fa-sync me-2"></i>
                  Renew All Certificates
                </>
              )}
            </button>
          </div>
          <div className="form-text mt-2">
            This will attempt to renew all SSL certificates on the system.
          </div>
        </div>

        <hr />

        {/* Information Section */}
        <div>
          <h6 className="text-muted mb-2">Information</h6>
          <div className="small text-muted">
            <p className="mb-2">
              <i className="fas fa-info-circle me-1"></i>
              SSL certificates are automatically configured for nginx using Let's Encrypt.
            </p>
            <p className="mb-2">
              <i className="fas fa-shield-alt me-1"></i>
              Certificates are valid for 90 days and should be renewed before expiration.
            </p>
            <p className="mb-0">
              <i className="fas fa-cog me-1"></i>
              Make sure your domain points to this server and port 80 is accessible.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CertificateActions;
