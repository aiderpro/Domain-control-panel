import React from 'react';

function DomainList({ domains, onDomainSelect, selectedDomain, loading }) {
  const getSSLStatusBadge = (ssl) => {
    if (!ssl) {
      return <span className="badge bg-secondary">Unknown</span>;
    }

    if (ssl.status === 'error') {
      return <span className="badge bg-danger">Error</span>;
    }

    if (!ssl.hasSSL) {
      return <span className="badge bg-warning">No SSL</span>;
    }

    if (ssl.isExpired) {
      return <span className="badge bg-danger">Expired</span>;
    }

    if (ssl.isExpiringSoon) {
      return <span className="badge bg-warning">Expiring Soon</span>;
    }

    return <span className="badge bg-success">Valid</span>;
  };

  const getSSLIcon = (ssl) => {
    if (!ssl || !ssl.hasSSL) {
      return <i className="fas fa-unlock text-muted"></i>;
    }

    if (ssl.isExpired) {
      return <i className="fas fa-times-circle text-danger"></i>;
    }

    if (ssl.isExpiringSoon) {
      return <i className="fas fa-exclamation-triangle text-warning"></i>;
    }

    return <i className="fas fa-shield-alt text-success"></i>;
  };

  const formatExpiryDate = (ssl) => {
    if (!ssl || !ssl.hasSSL || !ssl.expiryDate) {
      return 'N/A';
    }

    const date = new Date(ssl.expiryDate);
    return date.toLocaleDateString();
  };

  const getDaysUntilExpiry = (ssl) => {
    if (!ssl || !ssl.hasSSL || ssl.daysUntilExpiry === undefined) {
      return 'N/A';
    }

    if (ssl.daysUntilExpiry <= 0) {
      return 'Expired';
    }

    return `${ssl.daysUntilExpiry} days`;
  };

  if (loading && domains.length === 0) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-2 text-muted">Loading domains...</p>
      </div>
    );
  }

  if (domains.length === 0) {
    return (
      <div className="text-center py-5">
        <i className="fas fa-server fa-3x text-muted mb-3"></i>
        <h5 className="text-muted">No Domains Found</h5>
        <p className="text-muted">
          No nginx server configurations found in /etc/nginx/sites-available/
        </p>
        <small className="text-muted">
          Make sure nginx is properly configured and you have the necessary permissions.
        </small>
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-hover mb-0">
        <thead className="table-light">
          <tr>
            <th>Domain</th>
            <th>SSL Status</th>
            <th>Expires</th>
            <th>Days Left</th>
            <th>Enabled</th>
          </tr>
        </thead>
        <tbody>
          {domains.map((domain, index) => (
            <tr
              key={`${domain.domain}-${index}`}
              className={`cursor-pointer ${selectedDomain?.domain === domain.domain ? 'table-active' : ''}`}
              onClick={() => onDomainSelect(domain)}
              style={{ cursor: 'pointer' }}
            >
              <td>
                <div className="d-flex align-items-center">
                  {getSSLIcon(domain.ssl)}
                  <div className="ms-2">
                    <div className="fw-medium">{domain.domain}</div>
                    {domain.serverNames && domain.serverNames.length > 1 && (
                      <small className="text-muted">
                        +{domain.serverNames.length - 1} more
                      </small>
                    )}
                  </div>
                </div>
              </td>
              <td>
                {getSSLStatusBadge(domain.ssl)}
                {domain.ssl?.issuerOrg && (
                  <small className="d-block text-muted mt-1">
                    {domain.ssl.issuerOrg}
                  </small>
                )}
              </td>
              <td>
                <span className={domain.ssl?.isExpired ? 'text-danger' : domain.ssl?.isExpiringSoon ? 'text-warning' : ''}>
                  {formatExpiryDate(domain.ssl)}
                </span>
              </td>
              <td>
                <span className={domain.ssl?.isExpired ? 'text-danger fw-bold' : domain.ssl?.isExpiringSoon ? 'text-warning fw-bold' : ''}>
                  {getDaysUntilExpiry(domain.ssl)}
                </span>
              </td>
              <td>
                {domain.enabled ? (
                  <span className="badge bg-success">
                    <i className="fas fa-check"></i> Enabled
                  </span>
                ) : (
                  <span className="badge bg-secondary">
                    <i className="fas fa-times"></i> Disabled
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DomainList;
