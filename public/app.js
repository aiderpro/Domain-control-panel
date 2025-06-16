// SSL Certificate Manager - Main Application

class SSLManager {
  constructor() {
    this.domains = [];
    this.filteredDomains = [];
    this.selectedDomain = null;
    this.socket = null;
    this.notifications = [];
    this.loading = false;
    this.connectionStatus = 'connecting';
    
    // Pagination settings
    this.currentPage = 1;
    this.itemsPerPage = 25;
    this.totalPages = 1;
    
    // Filter and search settings
    this.searchTerm = '';
    this.statusFilter = 'all'; // all, ssl, no-ssl, expiring, expired
    this.sortBy = 'domain'; // domain, expiry, status
    this.sortOrder = 'asc'; // asc, desc
    
    this.init();
  }

  async init() {
    this.renderApp();
    this.bindEvents();
    this.initSocket();
    // Don't load domains immediately - wait for socket connection
  }

  initSocket() {
    // Configure Socket.IO connection for both development and production
    const socketOptions = {
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000,
      forceNew: false
    };
    
    this.socket = io(socketOptions);
    
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connectionStatus = 'connected';
      this.updateConnectionStatus();
      // Render dashboard first to create DOM structure, then load domains
      this.renderDashboard();
      this.loadDomains();
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.connectionStatus = 'disconnected';
      this.updateConnectionStatus();
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      console.error('Error details:', {
        message: error.message,
        type: error.type,
        transport: error.transport,
        description: error.description
      });
      this.connectionStatus = 'error';
      this.updateConnectionStatus();
      
      // Add user-friendly error notification
      this.addNotification('error', `Connection failed: ${error.message || 'Server unreachable'}. Check server status.`, true);
    });

    // SSL operation listeners
    this.socket.on('ssl_install_progress', (data) => {
      this.addNotification('info', `Installing SSL for ${data.domain}: ${data.message}`, false);
    });

    this.socket.on('ssl_install_complete', (data) => {
      this.addNotification('success', `SSL certificate installed successfully for ${data.domain}`, true);
      this.loadDomains();
    });

    this.socket.on('ssl_install_error', (data) => {
      this.addNotification('error', `SSL installation failed for ${data.domain}: ${data.error}`, true);
    });

    this.socket.on('ssl_renew_progress', (data) => {
      this.addNotification('info', `Renewing SSL for ${data.domain}: ${data.message}`, false);
    });

    this.socket.on('ssl_renew_complete', (data) => {
      this.addNotification('success', `SSL certificate renewed successfully for ${data.domain}`, true);
      this.loadDomains();
    });

    this.socket.on('ssl_renew_error', (data) => {
      this.addNotification('error', `SSL renewal failed for ${data.domain}: ${data.error}`, true);
    });

    // Domain management listeners
    this.socket.on('domain_add_progress', (data) => {
      this.addNotification('info', `Adding domain ${data.domain}: ${data.message}`, false);
    });

    this.socket.on('domain_add_complete', (data) => {
      this.addNotification('success', `Domain ${data.domain} added successfully`, true);
      this.loadDomains();
    });

    this.socket.on('domain_add_error', (data) => {
      this.addNotification('error', `Failed to add domain ${data.domain}: ${data.error}`, true);
    });
  }

  async api(method, url, data = null) {
    try {
      const config = {
        method,
        url: `/api${url}`,
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' }
      };
      
      if (data) {
        config.data = data;
      }
      
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  async loadDomains() {
    try {
      this.loading = true;
      this.renderLoading();
      
      const response = await this.api('GET', '/domains');
      this.domains = response.domains || [];
      
      // Set loading to false BEFORE rendering
      this.loading = false;
      
      this.applyFiltersAndSort();
      this.updateStats();
      this.renderDomainList();
      this.renderSSLPanel();
      
    } catch (error) {
      console.error('Error loading domains:', error);
      this.loading = false;
      
      // Try to safely show error message
      const container = document.getElementById('domain-list-container');
      if (container) {
        container.innerHTML = `
          <div class="text-center py-5">
            <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
            <h5 class="text-danger">Failed to load domains</h5>
            <p class="text-muted">${error.message || 'Unknown error occurred'}</p>
            <button class="btn btn-primary" onclick="sslManager.loadDomains()">
              <i class="fas fa-retry me-1"></i> Try Again
            </button>
          </div>
        `;
      } else {
        // If container doesn't exist, render dashboard first then retry
        console.warn('Domain container not found, rendering dashboard and retrying...');
        this.renderDashboard();
        setTimeout(() => this.loadDomains(), 100);
        return;
      }
      
      // Only add notification if we can safely do so
      try {
        this.addNotification('error', 'Failed to load domains: ' + (error.message || 'Unknown error'), true);
      } catch (notificationError) {
        console.error('Failed to add notification:', notificationError);
      }
    }
  }

  applyFiltersAndSort() {
    let filtered = [...this.domains];
    
    // Apply search filter
    if (this.searchTerm) {
      const searchLower = this.searchTerm.toLowerCase();
      filtered = filtered.filter(domain => 
        domain.domain.toLowerCase().includes(searchLower) ||
        (domain.serverNames && domain.serverNames.some(name => 
          name.toLowerCase().includes(searchLower)
        ))
      );
    }
    
    // Apply status filter
    if (this.statusFilter !== 'all') {
      filtered = filtered.filter(domain => {
        const ssl = domain.ssl;
        switch (this.statusFilter) {
          case 'ssl': return ssl?.hasSSL === true;
          case 'no-ssl': return !ssl?.hasSSL;
          case 'expiring': return ssl?.hasSSL && ssl?.isExpiringSoon && !ssl?.isExpired;
          case 'expired': return ssl?.hasSSL && ssl?.isExpired;
          default: return true;
        }
      });
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (this.sortBy) {
        case 'expiry':
          aValue = a.ssl?.expiryDate ? new Date(a.ssl.expiryDate) : new Date(0);
          bValue = b.ssl?.expiryDate ? new Date(b.ssl.expiryDate) : new Date(0);
          break;
        case 'status':
          aValue = this.getSSLSortValue(a.ssl);
          bValue = this.getSSLSortValue(b.ssl);
          break;
        default: // domain
          aValue = a.domain.toLowerCase();
          bValue = b.domain.toLowerCase();
      }
      
      if (this.sortOrder === 'desc') {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      } else {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
    });
    
    this.filteredDomains = filtered;
    this.totalPages = Math.ceil(filtered.length / this.itemsPerPage);
    
    // Reset to first page if current page is beyond total pages
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }
  }

  getSSLSortValue(ssl) {
    if (!ssl || !ssl.hasSSL) return 0;
    if (ssl.isExpired) return 1;
    if (ssl.isExpiringSoon) return 2;
    return 3;
  }

  getCurrentPageDomains() {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.filteredDomains.slice(startIndex, endIndex);
  }

  setPage(page) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.renderDomainList();
    }
  }

  setSearch(term) {
    this.searchTerm = term;
    this.currentPage = 1;
    this.applyFiltersAndSort();
    this.renderDomainList();
  }

  setStatusFilter(filter) {
    this.statusFilter = filter;
    this.currentPage = 1;
    this.applyFiltersAndSort();
    this.renderDomainList();
  }

  setSorting(sortBy, sortOrder) {
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
    this.applyFiltersAndSort();
    this.renderDomainList();
  }

  async refreshDomains() {
    try {
      await this.api('POST', '/domains/refresh');
      this.addNotification('info', 'Domain refresh initiated...', false);
    } catch (error) {
      this.addNotification('error', 'Failed to refresh domains: ' + error.message, true);
    }
  }

  async installSSL(domain, email) {
    try {
      await this.api('POST', '/ssl/install', { domain, email });
      this.addNotification('info', `SSL installation started for ${domain}...`, false);
    } catch (error) {
      this.addNotification('error', `Failed to install SSL: ${error.response?.data?.message || error.message}`, true);
    }
  }

  async renewSSL(domain) {
    try {
      await this.api('POST', '/ssl/renew', { domain });
      this.addNotification('info', `SSL renewal started for ${domain}...`, false);
    } catch (error) {
      this.addNotification('error', `Failed to renew SSL: ${error.response?.data?.message || error.message}`, true);
    }
  }

  async renewAllSSL() {
    try {
      await this.api('POST', '/ssl/renew-all');
      this.addNotification('info', 'Renewing all SSL certificates...', false);
    } catch (error) {
      this.addNotification('error', `Failed to renew all certificates: ${error.response?.data?.message || error.message}`, true);
    }
  }

  updateStats() {
    const total = this.domains.length;
    const withSSL = this.domains.filter(d => d.ssl?.hasSSL).length;
    const expiringSoon = this.domains.filter(d => 
      d.ssl?.hasSSL && d.ssl?.isExpiringSoon && !d.ssl?.isExpired
    ).length;
    const expired = this.domains.filter(d => 
      d.ssl?.hasSSL && d.ssl?.isExpired
    ).length;

    const statTotal = document.getElementById('stat-total');
    const statSSL = document.getElementById('stat-ssl');
    const statExpiring = document.getElementById('stat-expiring');
    const statExpired = document.getElementById('stat-expired');
    
    if (statTotal) statTotal.textContent = total;
    if (statSSL) statSSL.textContent = withSSL;
    if (statExpiring) statExpiring.textContent = expiringSoon;
    if (statExpired) statExpired.textContent = expired;
    
    // Update filtered stats
    const filteredStats = document.getElementById('filtered-stats');
    if (filteredStats) {
      filteredStats.innerHTML = `Showing ${this.filteredDomains.length} of ${total} domains`;
    }
  }

  selectDomain(domain) {
    this.selectedDomain = domain;
    
    // Update table selection
    document.querySelectorAll('#domain-table tbody tr').forEach(row => {
      row.classList.remove('table-active');
    });
    
    const selectedRow = document.querySelector(`[data-domain="${domain.domain}"]`);
    if (selectedRow) {
      selectedRow.classList.add('table-active');
    }
    
    this.renderSSLPanel();
  }

  addNotification(type, message, persistent = false) {
    const notification = {
      id: Date.now() + Math.random(),
      type,
      message,
      timestamp: new Date(),
      persistent
    };

    this.notifications.push(notification);
    this.renderNotifications();

    if (!persistent) {
      setTimeout(() => {
        this.removeNotification(notification.id);
      }, 5000);
    }
  }

  removeNotification(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.renderNotifications();
  }

  updateConnectionStatus() {
    const statusConfig = {
      connecting: { class: 'bg-warning', text: 'Connecting...', icon: 'fas fa-spinner fa-spin' },
      connected: { class: 'bg-success', text: 'Connected', icon: 'fas fa-check-circle' },
      disconnected: { class: 'bg-danger', text: 'Disconnected', icon: 'fas fa-times-circle' },
      error: { class: 'bg-danger', text: 'Connection Error', icon: 'fas fa-exclamation-triangle' }
    };

    const config = statusConfig[this.connectionStatus] || statusConfig.error;
    const statusElement = document.getElementById('connection-status');
    
    if (statusElement) {
      statusElement.className = `badge ${config.class} d-flex align-items-center gap-1`;
      statusElement.innerHTML = `<i class="${config.icon}"></i> ${config.text}`;
    }
  }

  renderApp() {
    document.getElementById('root').innerHTML = `
      <div class="App">
        <!-- Header -->
        <nav class="navbar navbar-dark bg-primary mb-4">
          <div class="container-fluid">
            <span class="navbar-brand mb-0 h1 d-flex align-items-center">
              <i class="fas fa-shield-alt me-2"></i>
              SSL Certificate Manager
            </span>
            <div class="d-flex align-items-center gap-3">
              <span id="connection-status" class="badge bg-warning">
                <i class="fas fa-spinner fa-spin"></i> Connecting...
              </span>
              <span class="text-light small">
                <i class="fas fa-clock me-1"></i>
                <span id="current-time">${new Date().toLocaleString()}</span>
              </span>
            </div>
          </div>
        </nav>

        <!-- Notifications -->
        <div class="container-fluid mb-3">
          <div id="notifications" class="notification-container"></div>
        </div>

        <!-- Main Content -->
        <div class="container-fluid">
          <div id="main-content">
            <div class="text-center py-5">
              <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <h4 class="text-muted">Connecting to SSL Management Server...</h4>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer class="bg-light mt-5 py-3">
          <div class="container-fluid text-center text-muted">
            <small>
              <i class="fas fa-lock me-1"></i>
              SSL Certificate Manager - Manage your nginx domains and SSL certificates
            </small>
          </div>
        </footer>
      </div>
    `;

    // Update time every second
    setInterval(() => {
      const timeElement = document.getElementById('current-time');
      if (timeElement) {
        timeElement.textContent = new Date().toLocaleString();
      }
    }, 1000);
  }

  renderDashboard() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;
    
    mainContent.innerHTML = `
      <!-- Stats Overview -->
      <div class="row mb-4">
        <div class="col-md-3">
          <div class="card bg-primary text-white">
            <div class="card-body">
              <div class="d-flex justify-content-between">
                <div>
                  <h5 class="card-title">Total Domains</h5>
                  <h2 class="mb-0" id="stat-total">0</h2>
                </div>
                <div class="align-self-center">
                  <i class="fas fa-globe fa-2x"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card bg-success text-white">
            <div class="card-body">
              <div class="d-flex justify-content-between">
                <div>
                  <h5 class="card-title">With SSL</h5>
                  <h2 class="mb-0" id="stat-ssl">0</h2>
                </div>
                <div class="align-self-center">
                  <i class="fas fa-shield-alt fa-2x"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card bg-warning text-white">
            <div class="card-body">
              <div class="d-flex justify-content-between">
                <div>
                  <h5 class="card-title">Expiring Soon</h5>
                  <h2 class="mb-0" id="stat-expiring">0</h2>
                </div>
                <div class="align-self-center">
                  <i class="fas fa-exclamation-triangle fa-2x"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card bg-danger text-white">
            <div class="card-body">
              <div class="d-flex justify-content-between">
                <div>
                  <h5 class="card-title">Expired</h5>
                  <h2 class="mb-0" id="stat-expired">0</h2>
                </div>
                <div class="align-self-center">
                  <i class="fas fa-times-circle fa-2x"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="row">
        <!-- Domain List -->
        <div class="col-lg-8">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h5 class="mb-0">
                <i class="fas fa-list me-2"></i>
                Domains
              </h5>
              <div class="d-flex gap-2">
                <button class="btn btn-outline-primary btn-sm" onclick="sslManager.refreshDomains()">
                  <i class="fas fa-sync-alt me-1"></i>
                  Refresh
                </button>
                <button class="btn btn-success btn-sm" onclick="sslManager.toggleAddDomainForm()">
                  <i class="fas fa-plus me-1"></i>
                  Add Domain
                </button>
              </div>
            </div>
            <div class="card-body p-0">
              <!-- Add Domain Form -->
              <div id="add-domain-form" class="border-bottom p-3" style="display: none;">
                <h6 class="mb-3">
                  <i class="fas fa-plus me-2"></i>
                  Add New Domain
                </h6>
                <div class="row align-items-end">
                  <div class="col-md-6">
                    <label class="form-label">Domain Name:</label>
                    <input type="text" class="form-control" id="new-domain-input" placeholder="example.com or subdomain.example.com" 
                           onkeypress="if(event.key==='Enter') sslManager.addDomainFromForm()">
                    <small class="text-muted">Enter domain without http:// or https://</small>
                  </div>
                  <div class="col-md-4">
                    <button class="btn btn-success" onclick="sslManager.addDomainFromForm()">
                      <i class="fas fa-plus me-1"></i> Add Domain
                    </button>
                    <button class="btn btn-outline-secondary ms-2" onclick="sslManager.toggleAddDomainForm()">
                      Cancel
                    </button>
                  </div>
                  <div class="col-md-2">
                    <small class="text-muted">Document root: /var/www/html</small>
                  </div>
                </div>
                <div id="domain-validation-message" class="mt-2" style="display: none;"></div>
              </div>
              
              <div id="domain-list-container">
                <div class="text-center py-4">
                  <div class="spinner-border text-primary" role="status"></div>
                  <p class="mt-2 text-muted">Loading domains...</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- SSL Status & Actions -->
        <div class="col-lg-4">
          <div id="ssl-panel">
            <div class="card">
              <div class="card-body text-center py-5">
                <i class="fas fa-mouse-pointer fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">Select a Domain</h5>
                <p class="text-muted">
                  Click on a domain from the list to view SSL status and perform actions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderLoading() {
    const container = document.getElementById('domain-list-container');
    if (!container) {
      console.warn('Domain list container not found, cannot show loading state');
      return;
    }
    
    // Only show loading spinner in the domain list container, not the entire main content
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary mb-3" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <h4 class="text-muted">Loading domains...</h4>
      </div>
    `;
  }

  safeSetContent(elementId, content) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = content;
      return true;
    }
    return false;
  }

  safeSetText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = text;
      return true;
    }
    return false;
  }

  renderDomainList() {
    const container = document.getElementById('domain-list-container');
    if (!container) return;
    
    // If still loading, don't render anything - let renderLoading handle it
    if (this.loading) {
      return;
    }
    
    if (this.domains.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5">
          <i class="fas fa-server fa-3x text-muted mb-3"></i>
          <h5 class="text-muted">No Domains Found</h5>
          <p class="text-muted">
            No nginx server configurations found in /etc/nginx/sites-available/
          </p>
          <small class="text-muted">
            Make sure nginx is properly configured and you have the necessary permissions.
          </small>
        </div>
      `;
      return;
    }

    // Render search and filter controls
    const controlsHtml = `
      <div class="p-3 border-bottom">
        <div class="row g-3">
          <div class="col-md-4">
            <div class="input-group">
              <span class="input-group-text"><i class="fas fa-search"></i></span>
              <input type="text" class="form-control" placeholder="Search domains..." 
                     value="${this.searchTerm}" 
                     onkeyup="sslManager.setSearch(this.value)">
            </div>
          </div>
          <div class="col-md-3">
            <select class="form-select" onchange="sslManager.setStatusFilter(this.value)">
              <option value="all" ${this.statusFilter === 'all' ? 'selected' : ''}>All Domains</option>
              <option value="ssl" ${this.statusFilter === 'ssl' ? 'selected' : ''}>With SSL</option>
              <option value="no-ssl" ${this.statusFilter === 'no-ssl' ? 'selected' : ''}>No SSL</option>
              <option value="expiring" ${this.statusFilter === 'expiring' ? 'selected' : ''}>Expiring Soon</option>
              <option value="expired" ${this.statusFilter === 'expired' ? 'selected' : ''}>Expired</option>
            </select>
          </div>
          <div class="col-md-3">
            <select class="form-select" onchange="sslManager.setSorting(this.value, '${this.sortOrder}')">
              <option value="domain" ${this.sortBy === 'domain' ? 'selected' : ''}>Sort by Domain</option>
              <option value="expiry" ${this.sortBy === 'expiry' ? 'selected' : ''}>Sort by Expiry</option>
              <option value="status" ${this.sortBy === 'status' ? 'selected' : ''}>Sort by Status</option>
            </select>
          </div>
          <div class="col-md-2">
            <button class="btn btn-outline-secondary" onclick="sslManager.setSorting('${this.sortBy}', '${this.sortOrder === 'asc' ? 'desc' : 'asc'}')">
              <i class="fas fa-sort-${this.sortOrder === 'asc' ? 'up' : 'down'}"></i>
              ${this.sortOrder === 'asc' ? 'Asc' : 'Desc'}
            </button>
          </div>
        </div>
        <div class="mt-2">
          <small class="text-muted" id="filtered-stats">
            Showing ${this.filteredDomains.length} of ${this.domains.length} domains
          </small>
        </div>
      </div>
    `;

    const currentPageDomains = this.getCurrentPageDomains();
    const tableRows = currentPageDomains.map(domain => {
      const ssl = domain.ssl;
      const sslBadge = this.getSSLStatusBadge(ssl);
      const sslIcon = this.getSSLIcon(ssl);
      const expiryDate = this.formatExpiryDate(ssl);
      const daysLeft = this.getDaysUntilExpiry(ssl);
      const hasSSL = ssl?.hasSSL;
      
      return `
        <tr class="cursor-pointer" data-domain="${domain.domain}" onclick="sslManager.selectDomain(${JSON.stringify(domain).replace(/"/g, '&quot;')})">
          <td>
            <div class="d-flex align-items-center">
              ${sslIcon}
              <div class="ms-2">
                <div class="fw-medium">${domain.domain}</div>
                ${domain.serverNames && domain.serverNames.length > 1 ? 
                  `<small class="text-muted">+${domain.serverNames.length - 1} more</small>` : ''}
              </div>
            </div>
          </td>
          <td>
            ${sslBadge}
            ${ssl?.issuerOrg ? `<small class="d-block text-muted mt-1">${ssl.issuerOrg}</small>` : ''}
          </td>
          <td>
            <span class="${ssl?.isExpired ? 'text-danger' : ssl?.isExpiringSoon ? 'text-warning' : ''}">${expiryDate}</span>
          </td>
          <td>
            <span class="${ssl?.isExpired ? 'text-danger fw-bold' : ssl?.isExpiringSoon ? 'text-warning fw-bold' : ''}">${daysLeft}</span>
          </td>
          <td>
            ${domain.enabled ? 
              '<span class="badge bg-success"><i class="fas fa-check"></i> Enabled</span>' : 
              '<span class="badge bg-secondary"><i class="fas fa-times"></i> Disabled</span>'}
          </td>
          <td>
            <div class="btn-group btn-group-sm" role="group">
              ${!hasSSL ? `
                <button class="btn btn-success" onclick="event.stopPropagation(); sslManager.toggleInstallForm('${domain.domain}')" title="Install SSL Certificate">
                  <i class="fas fa-plus"></i> Install SSL
                </button>
              ` : `
                <button class="btn btn-primary" onclick="event.stopPropagation(); sslManager.renewSSL('${domain.domain}')" title="Renew SSL Certificate">
                  <i class="fas fa-sync-alt"></i> Renew
                </button>
              `}
              <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); sslManager.selectDomain(${JSON.stringify(domain).replace(/"/g, '&quot;')})" title="View Details">
                <i class="fas fa-eye"></i>
              </button>
            </div>
          </td>
        </tr>
        ${!hasSSL ? `
        <tr id="install-form-${domain.domain}" class="install-form-row" style="display: none;">
          <td colspan="6" class="p-3 bg-light">
            <div class="row align-items-end">
              <div class="col-md-6">
                <label class="form-label">Email for Let's Encrypt:</label>
                <input type="email" class="form-control" id="email-${domain.domain}" placeholder="admin@example.com" required>
              </div>
              <div class="col-md-4">
                <button class="btn btn-success" onclick="sslManager.installSSLFromForm('${domain.domain}')">
                  <i class="fas fa-download me-1"></i> Install Certificate
                </button>
                <button class="btn btn-outline-secondary ms-2" onclick="sslManager.toggleInstallForm('${domain.domain}')">
                  Cancel
                </button>
              </div>
              <div class="col-md-2">
                <small class="text-muted">Required for certificate registration and renewal notifications.</small>
              </div>
            </div>
          </td>
        </tr>
        ` : ''}
      `;
    }).join('');

    // Render pagination controls
    const paginationHtml = this.renderPagination();

    container.innerHTML = `
      ${controlsHtml}
      <div class="table-responsive">
        <table class="table table-hover mb-0" id="domain-table">
          <thead class="table-light">
            <tr>
              <th>Domain</th>
              <th>SSL Status</th>
              <th>Expires</th>
              <th>Days Left</th>
              <th>Enabled</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
      ${paginationHtml}
    `;
  }

  renderPagination() {
    if (this.totalPages <= 1) return '';

    const pages = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    const pageButtons = pages.map(page => `
      <button class="btn btn-sm ${page === this.currentPage ? 'btn-primary' : 'btn-outline-primary'}" 
              onclick="sslManager.setPage(${page})">${page}</button>
    `).join('');

    return `
      <div class="p-3 border-top">
        <div class="d-flex justify-content-between align-items-center">
          <div class="text-muted">
            Page ${this.currentPage} of ${this.totalPages} 
            (${((this.currentPage - 1) * this.itemsPerPage) + 1}-${Math.min(this.currentPage * this.itemsPerPage, this.filteredDomains.length)} of ${this.filteredDomains.length})
          </div>
          <div class="btn-group" role="group">
            <button class="btn btn-sm btn-outline-primary" 
                    onclick="sslManager.setPage(1)" 
                    ${this.currentPage === 1 ? 'disabled' : ''}>
              <i class="fas fa-angle-double-left"></i>
            </button>
            <button class="btn btn-sm btn-outline-primary" 
                    onclick="sslManager.setPage(${this.currentPage - 1})" 
                    ${this.currentPage === 1 ? 'disabled' : ''}>
              <i class="fas fa-angle-left"></i>
            </button>
            ${pageButtons}
            <button class="btn btn-sm btn-outline-primary" 
                    onclick="sslManager.setPage(${this.currentPage + 1})" 
                    ${this.currentPage === this.totalPages ? 'disabled' : ''}>
              <i class="fas fa-angle-right"></i>
            </button>
            <button class="btn btn-sm btn-outline-primary" 
                    onclick="sslManager.setPage(${this.totalPages})" 
                    ${this.currentPage === this.totalPages ? 'disabled' : ''}>
              <i class="fas fa-angle-double-right"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderSSLPanel() {
    const panel = document.getElementById('ssl-panel');
    
    if (!this.selectedDomain) {
      panel.innerHTML = `
        <div class="card">
          <div class="card-body text-center py-5">
            <i class="fas fa-mouse-pointer fa-3x text-muted mb-3"></i>
            <h5 class="text-muted">Select a Domain</h5>
            <p class="text-muted">
              Click on a domain from the list to view SSL status and perform actions.
            </p>
          </div>
        </div>
      `;
      return;
    }

    const domain = this.selectedDomain;
    const ssl = domain.ssl;
    const hasSSL = ssl?.hasSSL;

    panel.innerHTML = `
      ${this.renderSSLStatus(domain)}
      ${this.renderCertificateActions(domain)}
    `;
  }

  renderSSLStatus(domain) {
    const ssl = domain.ssl;
    const statusColor = !ssl || !ssl.hasSSL ? 'text-muted' : 
                      ssl.isExpired ? 'text-danger' : 
                      ssl.isExpiringSoon ? 'text-warning' : 'text-success';
    const statusIcon = !ssl || !ssl.hasSSL ? 'fas fa-unlock' : 
                      ssl.isExpired ? 'fas fa-times-circle' : 
                      ssl.isExpiringSoon ? 'fas fa-exclamation-triangle' : 'fas fa-shield-alt';

    return `
      <div class="card mb-3">
        <div class="card-header">
          <h6 class="mb-0">
            <i class="fas fa-certificate me-2"></i>
            SSL Certificate Status
          </h6>
        </div>
        <div class="card-body">
          <div class="d-flex align-items-center mb-3">
            <i class="${statusIcon} fa-2x ${statusColor} me-3"></i>
            <div>
              <h5 class="mb-1">${domain.domain}</h5>
              <p class="mb-0 text-muted">${domain.filename}</p>
            </div>
          </div>

          ${ssl?.error ? `
            <div class="alert alert-danger" role="alert">
              <i class="fas fa-exclamation-triangle me-2"></i>
              <strong>Error:</strong> ${ssl.error}
            </div>
          ` : ssl?.hasSSL ? `
            <div class="row g-2 mb-3">
              <div class="col-sm-6">
                <div class="card bg-light">
                  <div class="card-body p-3">
                    <h6 class="card-title mb-2">
                      <i class="fas fa-calendar-alt me-1"></i>
                      Expires In
                    </h6>
                    <p class="card-text mb-0 ${ssl.isExpired ? 'text-danger fw-bold' : ssl.isExpiringSoon ? 'text-warning fw-bold' : 'text-success'}">
                      ${ssl.daysUntilExpiry !== undefined ? (ssl.daysUntilExpiry <= 0 ? 'Expired' : `${ssl.daysUntilExpiry} days`) : 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>
              <div class="col-sm-6">
                <div class="card bg-light">
                  <div class="card-body p-3">
                    <h6 class="card-title mb-2">
                      <i class="fas fa-building me-1"></i>
                      Issuer
                    </h6>
                    <p class="card-text mb-0 small">
                      ${ssl.issuerOrg || 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            ${ssl.isExpired ? `
              <div class="alert alert-danger" role="alert">
                <i class="fas fa-times-circle me-2"></i>
                <strong>Certificate Expired!</strong> This certificate has expired and needs immediate renewal.
              </div>
            ` : ssl.isExpiringSoon ? `
              <div class="alert alert-warning" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Certificate Expiring Soon!</strong> This certificate will expire in ${ssl.daysUntilExpiry} days.
              </div>
            ` : `
              <div class="alert alert-success" role="alert">
                <i class="fas fa-check-circle me-2"></i>
                <strong>Certificate Valid!</strong> This certificate is valid and up to date.
              </div>
            `}
          ` : `
            <div class="alert alert-warning" role="alert">
              <i class="fas fa-unlock me-2"></i>
              <strong>No SSL Certificate</strong>
              <p class="mb-0 mt-2">
                This domain does not have an SSL certificate configured. 
                You can install one using the actions panel.
              </p>
            </div>
          `}
        </div>
      </div>
    `;
  }

  renderCertificateActions(domain) {
    const ssl = domain.ssl;
    const hasSSL = ssl?.hasSSL;

    return `
      <div class="card">
        <div class="card-header">
          <h6 class="mb-0">
            <i class="fas fa-tools me-2"></i>
            Certificate Actions
          </h6>
        </div>
        <div class="card-body">
          ${!hasSSL ? `
            <div class="mb-3">
              <h6 class="text-muted mb-2">Install SSL Certificate</h6>
              <button class="btn btn-success w-100" onclick="sslManager.showInstallForm('${domain.domain}')">
                <i class="fas fa-plus me-2"></i>
                Install SSL Certificate
              </button>
            </div>
          ` : `
            <div class="mb-3">
              <h6 class="text-muted mb-2">Manage Certificate</h6>
              <div class="d-grid">
                <button class="btn btn-primary" onclick="sslManager.renewSSL('${domain.domain}')">
                  <i class="fas fa-sync-alt me-2"></i>
                  Renew Certificate
                </button>
              </div>
            </div>
          `}

          <hr>

          <div class="mb-3">
            <h6 class="text-muted mb-2">Bulk Actions</h6>
            <div class="d-grid">
              <button class="btn btn-outline-primary" onclick="sslManager.renewAllSSL()">
                <i class="fas fa-sync me-2"></i>
                Renew All Certificates
              </button>
            </div>
            <div class="form-text mt-2">
              This will attempt to renew all SSL certificates on the system.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  toggleInstallForm(domain) {
    const formRow = document.getElementById(`install-form-${domain}`);
    if (formRow) {
      const isVisible = formRow.style.display !== 'none';
      formRow.style.display = isVisible ? 'none' : 'table-row';
      
      // Clear any previous email input
      if (!isVisible) {
        const emailInput = document.getElementById(`email-${domain}`);
        if (emailInput) emailInput.value = '';
      }
    }
  }

  async installSSLFromForm(domain) {
    const emailInput = document.getElementById(`email-${domain}`);
    if (!emailInput) return;
    
    const email = emailInput.value.trim();
    if (!email) {
      this.addNotification('error', 'Email address is required', true);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.addNotification('error', 'Please enter a valid email address', true);
      return;
    }

    try {
      await this.installSSL(domain, email);
      this.toggleInstallForm(domain); // Hide the form after successful installation
      this.addNotification('success', `SSL installation started for ${domain}`, true);
    } catch (error) {
      this.addNotification('error', `Failed to install SSL: ${error.message}`, true);
    }
  }

  toggleAddDomainForm() {
    const form = document.getElementById('add-domain-form');
    const input = document.getElementById('new-domain-input');
    const validationMessage = document.getElementById('domain-validation-message');
    
    if (form) {
      const isVisible = form.style.display !== 'none';
      form.style.display = isVisible ? 'none' : 'block';
      
      if (!isVisible) {
        // Clear form when showing
        if (input) input.value = '';
        if (validationMessage) validationMessage.style.display = 'none';
        // Focus on input when form is shown
        setTimeout(() => input?.focus(), 100);
      }
    }
  }

  async validateDomain(domain) {
    try {
      const response = await this.api('POST', '/nginx/validate-domain', { domain });
      return response;
    } catch (error) {
      return { valid: false, error: error.response?.data?.error || error.message };
    }
  }

  async addDomainFromForm() {
    const input = document.getElementById('new-domain-input');
    const validationMessage = document.getElementById('domain-validation-message');
    
    if (!input) return;
    
    const domain = input.value.trim();
    if (!domain) {
      this.showValidationMessage('Domain name is required', 'error');
      return;
    }

    // Show validation in progress
    this.showValidationMessage('Validating domain...', 'info');

    try {
      // Validate domain format
      const validation = await this.validateDomain(domain);
      if (!validation.valid) {
        this.showValidationMessage(validation.error, 'error');
        return;
      }

      // Domain is valid, proceed with addition
      this.showValidationMessage('Domain valid, adding to nginx...', 'success');
      
      const response = await this.api('POST', '/nginx/add-domain', { domain });
      
      if (response.success) {
        this.addNotification('success', `Domain ${domain} added successfully`, true);
        this.toggleAddDomainForm(); // Hide form
        // Domain list will be refreshed automatically via socket event
      } else {
        this.showValidationMessage(response.error || 'Failed to add domain', 'error');
      }
    } catch (error) {
      this.showValidationMessage(error.response?.data?.error || error.message, 'error');
    }
  }

  showValidationMessage(message, type) {
    const validationMessage = document.getElementById('domain-validation-message');
    if (!validationMessage) return;
    
    const alertClass = type === 'error' ? 'alert-danger' : 
                     type === 'success' ? 'alert-success' : 'alert-info';
    
    validationMessage.innerHTML = `
      <div class="alert ${alertClass} alert-dismissible fade show mb-0" role="alert">
        ${message}
      </div>
    `;
    validationMessage.style.display = 'block';
    
    // Auto-hide non-error messages after 3 seconds
    if (type !== 'error') {
      setTimeout(() => {
        validationMessage.style.display = 'none';
      }, 3000);
    }
  }

  renderNotifications() {
    const container = document.getElementById('notifications');
    if (!container) return;
    
    container.innerHTML = this.notifications.map(notification => `
      <div class="alert alert-${notification.type === 'error' ? 'danger' : notification.type} alert-dismissible fade show" role="alert">
        <div class="d-flex align-items-start">
          <div class="flex-grow-1">
            <strong>
              ${notification.type === 'success' ? '<i class="fas fa-check-circle me-1"></i>' : ''}
              ${notification.type === 'error' ? '<i class="fas fa-exclamation-triangle me-1"></i>' : ''}
              ${notification.type === 'info' ? '<i class="fas fa-info-circle me-1"></i>' : ''}
            </strong>
            ${notification.message}
            <small class="d-block text-muted mt-1">
              ${notification.timestamp.toLocaleTimeString()}
            </small>
          </div>
          <button type="button" class="btn-close" onclick="sslManager.removeNotification(${notification.id})" aria-label="Close"></button>
        </div>
      </div>
    `).join('');
  }

  bindEvents() {
    // Connection status updates
    setTimeout(() => {
      if (this.connectionStatus === 'connected') {
        this.renderDashboard();
      }
    }, 1000);
  }

  getSSLStatusBadge(ssl) {
    if (!ssl) return '<span class="badge bg-secondary">Unknown</span>';
    if (ssl.status === 'error') return '<span class="badge bg-danger">Error</span>';
    if (!ssl.hasSSL) return '<span class="badge bg-warning">No SSL</span>';
    if (ssl.isExpired) return '<span class="badge bg-danger">Expired</span>';
    if (ssl.isExpiringSoon) return '<span class="badge bg-warning">Expiring Soon</span>';
    return '<span class="badge bg-success">Valid</span>';
  }

  getSSLIcon(ssl) {
    if (!ssl || !ssl.hasSSL) return '<i class="fas fa-unlock text-muted"></i>';
    if (ssl.isExpired) return '<i class="fas fa-times-circle text-danger"></i>';
    if (ssl.isExpiringSoon) return '<i class="fas fa-exclamation-triangle text-warning"></i>';
    return '<i class="fas fa-shield-alt text-success"></i>';
  }

  formatExpiryDate(ssl) {
    if (!ssl || !ssl.hasSSL || !ssl.expiryDate) return 'N/A';
    const date = new Date(ssl.expiryDate);
    return date.toLocaleDateString();
  }

  getDaysUntilExpiry(ssl) {
    if (!ssl || !ssl.hasSSL || ssl.daysUntilExpiry === undefined) return 'N/A';
    if (ssl.daysUntilExpiry <= 0) return 'Expired';
    return `${ssl.daysUntilExpiry} days`;
  }
}

// Initialize the application
let sslManager;
document.addEventListener('DOMContentLoaded', () => {
  sslManager = new SSLManager();
});