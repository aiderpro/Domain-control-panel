import React from 'react';

function SSLStatus({ domain }) {
  const ssl = domain.ssl;

  const getStatusColor = () => {
    if (!ssl || !ssl.hasSSL) return 'text-muted';
    if (ssl.isExpired) return 'text-danger';
    if (ssl.isExpiringSoon) return 'text-warning';
    return 'text-success';
  };

  const getStatusIcon = () => {
    if (!ssl || !ssl.hasSSL) return 'fas fa-unlock';
    if (ssl.isExpired) return 'fas fa-times-circle';
    if (ssl.isExpiringSoon) return 'fas fa-exclamation-triangle';
    return 'fas fa-shield-alt';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h6 className="mb-0">
          <i className="fas fa-certificate me-2"></i>
          SSL Certificate Status
        </h6>
      </div>
      <div className="card-body">
        <div className="d-flex align-items-center mb-3">
          <i className={`${getStatusIcon()} fa-2x ${getStatusColor()} me-3`}></i>
          <div>
            <h5 className="mb-1">{domain.domain}</h5>
            <p className="mb-0 text-muted">{domain.filename}</p>
          </div>
        </div>

        {ssl?.error ? (
          <div className="alert alert-danger" role="alert">
            <i className="fas fa-exclamation-triangle me-2"></i>
            <strong>Error:</strong> {ssl.error}
          </div>
        ) : ssl?.hasSSL ? (
          <div>
            {/* Certificate Details */}
            <div className="row g-2 mb-3">
              <div className="col-sm-6">
                <div className="card bg-light">
                  <div className="card-body p-3">
                    <h6 className="card-title mb-2">
                      <i className="fas fa-calendar-alt me-1"></i>
                      Expires In
                    </h6>
                    <p className={`card-text mb-0 ${ssl.isExpired ? 'text-danger fw-bold' : ssl.isExpiringSoon ? 'text-warning fw-bold' : 'text-success'}`}>
                      {ssl.daysUntilExpiry !== undefined ? (
                        ssl.daysUntilExpiry <= 0 ? 'Expired' : `${ssl.daysUntilExpiry} days`
                      ) : 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="col-sm-6">
                <div className="card bg-light">
                  <div className="card-body p-3">
                    <h6 className="card-title mb-2">
                      <i className="fas fa-building me-1"></i>
                      Issuer
                    </h6>
                    <p className="card-text mb-0 small">
                      {ssl.issuerOrg || 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Information */}
            <div className="table-responsive">
              <table className="table table-sm">
                <tbody>
                  <tr>
                    <td className="fw-medium">Common Name</td>
                    <td>{ssl.commonName || domain.domain}</td>
                  </tr>
                  <tr>
                    <td className="fw-medium">Issued Date</td>
                    <td>{formatDate(ssl.issuedDate)}</td>
                  </tr>
                  <tr>
                    <td className="fw-medium">Expiry Date</td>
                    <td className={ssl.isExpired ? 'text-danger' : ssl.isExpiringSoon ? 'text-warning' : ''}>
                      {formatDate(ssl.expiryDate)}
                    </td>
                  </tr>
                  {ssl.fingerprint && (
                    <tr>
                      <td className="fw-medium">Fingerprint</td>
                      <td>
                        <small className="font-monospace">{ssl.fingerprint}</small>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Status Alerts */}
            {ssl.isExpired && (
              <div className="alert alert-danger" role="alert">
                <i className="fas fa-times-circle me-2"></i>
                <strong>Certificate Expired!</strong> This certificate has expired and needs immediate renewal.
              </div>
            )}

            {ssl.isExpiringSoon && !ssl.isExpired && (
              <div className="alert alert-warning" role="alert">
                <i className="fas fa-exclamation-triangle me-2"></i>
                <strong>Certificate Expiring Soon!</strong> This certificate will expire in {ssl.daysUntilExpiry} days.
              </div>
            )}

            {!ssl.isExpired && !ssl.isExpiringSoon && (
              <div className="alert alert-success" role="alert">
                <i className="fas fa-check-circle me-2"></i>
                <strong>Certificate Valid!</strong> This certificate is valid and up to date.
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="alert alert-warning" role="alert">
              <i className="fas fa-unlock me-2"></i>
              <strong>No SSL Certificate</strong>
              <p className="mb-0 mt-2">
                This domain does not have an SSL certificate configured. 
                You can install one using the actions panel.
              </p>
            </div>

            {/* Domain Configuration Info */}
            <div className="table-responsive">
              <table className="table table-sm">
                <tbody>
                  <tr>
                    <td className="fw-medium">Server Names</td>
                    <td>
                      {domain.serverNames && domain.serverNames.length > 0 ? (
                        <div>
                          {domain.serverNames.map((name, index) => (
                            <span key={index} className="badge bg-light text-dark me-1">
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">None configured</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="fw-medium">Document Root</td>
                    <td>
                      <small className="font-monospace">
                        {domain.documentRoot || 'Not specified'}
                      </small>
                    </td>
                  </tr>
                  <tr>
                    <td className="fw-medium">Ports</td>
                    <td>
                      {domain.ports && domain.ports.length > 0 ? (
                        domain.ports.map((port, index) => (
                          <span key={index} className="badge bg-secondary me-1">
                            {port}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted">None specified</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="fw-medium">Site Status</td>
                    <td>
                      {domain.enabled ? (
                        <span className="badge bg-success">
                          <i className="fas fa-check me-1"></i>
                          Enabled
                        </span>
                      ) : (
                        <span className="badge bg-secondary">
                          <i className="fas fa-times me-1"></i>
                          Disabled
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SSLStatus;
