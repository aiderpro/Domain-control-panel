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
    
    // API Base URL configuration
    this.apiBaseUrl = this.getApiBaseUrl();
    
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

  getApiBaseUrl() {
    // Use production server for API calls
    const productionApiUrl = 'https://sitedev.eezix.com';
    
    console.log('Using production API server:', productionApiUrl);
    
    return productionApiUrl;
  }

  async init() {
    // Wait for DOM to be completely ready
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }
    
    // Initialize UI components in order
    this.renderApp();
    this.renderDashboard();
    
    // Wait for DOM elements to be rendered
    await this.ensureDOMReady();
    
    this.bindEvents();
    this.initSocket();
    
    // Load domains after everything is set up
    this.loadDomains();
  }
  
  async ensureDOMReady() {
    // Wait for dashboard elements to be in DOM
    let attempts = 0;
    while (!document.getElementById('domain-list-container') && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }
    
    if (!document.getElementById('domain-list-container')) {
      console.error('Dashboard container not found after waiting');
    }
  }

  initSocket() {
    // Configure Socket.IO connection to production server
    const socketOptions = {
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000,
      forceNew: false
    };
    
    this.socket = io('https://sitedev.eezix.com', socketOptions);
    
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connectionStatus = 'connected';
      this.updateConnectionStatus();
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

    // Domain deletion listeners
    this.socket.on('domain_deleted', (data) => {
      this.addNotification('success', `Domain ${data.domain} deleted successfully`, true);
      this.loadDomains();
    });

    this.socket.on('domain_delete_error', (data) => {
      this.addNotification('error', `Failed to delete domain ${data.domain}: ${data.error}`, true);
    });
  }

  async api(method, url, data = null) {
    try {
      const finalUrl = `${this.apiBaseUrl}/api${url}`;
      console.log(`Making ${method} request to: ${finalUrl}`);
      
      const config = {
        method,
        url: finalUrl,
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' }
      };
      
      if (data) {
        config.data = data;
        console.log('Request data:', data);
      }
      
      const response = await axios(config);
      console.log('API Response:', response.status, response.data);
      return response.data;
    } catch (error) {
      console.error('API Error details:', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      throw error;
    }
  }

  async loadDomains() {
    const container = document.getElementById('domain-list-container');
    if (!container) {
      console.error('Domain container not found during loadDomains');
      return;
    }

    try {
      this.loading = true;
      this.renderLoading();
      
      const response = await this.api('GET', '/domains');
      this.domains = response.domains || [];
      
    } catch (error) {
      console.error('Error loading domains:', error);
      
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
      
      this.addNotification('error', 'Failed to load domains: ' + (error.message || 'Unknown error'), true);
      return;
    } finally {
      this.loading = false;
    }
    
    this.applyFiltersAndSort();
    this.updateStats();
    this.renderDomainList();
    this.renderSSLPanel();
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
    await this.loadDomains();
  }

  async installSSL(domain, email) {
    try {
      this.addNotification('info', `Starting SSL installation for ${domain}...`, false);
      
      const response = await this.api('POST', '/ssl/install', { domain, email });
      
      if (response.success) {
        this.addNotification('success', `SSL installation started for ${domain}`, false);
      } else {
        this.addNotification('error', `Failed to start SSL installation: ${response.error}`, true);
      }
    } catch (error) {
      console.error('SSL installation error:', error);
      this.addNotification('error', `SSL installation failed: ${error.message}`, true);
    }
  }

  async renewSSL(domain) {
    try {
      this.addNotification('info', `Starting SSL renewal for ${domain}...`, false);
      
      const response = await this.api('POST', '/ssl/renew', { domain });
      
      if (response.success) {
        this.addNotification('success', `SSL renewal started for ${domain}`, false);
      } else {
        this.addNotification('error', `Failed to start SSL renewal: ${response.error}`, true);
      }
    } catch (error) {
      console.error('SSL renewal error:', error);
      this.addNotification('error', `SSL renewal failed: ${error.message}`, true);
    }
  }

  async renewAllSSL() {
    try {
      this.addNotification('info', 'Starting SSL renewal for all domains...', false);
      
      const response = await this.api('POST', '/ssl/renew-all');
      
      if (response.success) {
        this.addNotification('success', 'SSL renewal started for all domains', false);
      } else {
        this.addNotification('error', `Failed to start SSL renewal: ${response.error}`, true);
      }
    } catch (error) {
      console.error('SSL renewal error:', error);
      this.addNotification('error', `SSL renewal failed: ${error.message}`, true);
    }
  }

  updateStats() {
    const stats = {
      total: this.domains.length,
      withSSL: this.domains.filter(d => d.ssl?.hasSSL).length,
      expiring: this.domains.filter(d => d.ssl?.isExpiringSoon && !d.ssl?.isExpired).length,
      expired: this.domains.filter(d => d.ssl?.isExpired).length
    };

    this.safeSetText('stat-total', stats.total);
    this.safeSetText('stat-ssl', stats.withSSL);
    this.safeSetText('stat-expiring', stats.expiring);
    this.safeSetText('stat-expired', stats.expired);
  }

  selectDomain(domain) {
    this.selectedDomain = domain;
    this.renderDomainList();
    this.renderSSLPanel();
  }

  addNotification(type, message, persistent = false) {
    const id = Date.now();
    const notification = { id, type, message, persistent };
    this.notifications.push(notification);
    this.renderNotifications();

    if (!persistent) {
      setTimeout(() => this.removeNotification(id), 5000);
    }
  }

  removeNotification(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.renderNotifications();
  }

  updateConnectionStatus() {
    const statusElement = document.getElementById('connection-status');
    if (!statusElement) return;

    let statusClass, statusText, statusIcon;
    
    switch (this.connectionStatus) {
      case 'connected':
        statusClass = 'text-success';
        statusText = 'Connected';
        statusIcon = 'fas fa-circle';
        break;
      case 'disconnected':
        statusClass = 'text-warning';
        statusText = 'Disconnected';
        statusIcon = 'fas fa-circle';
        break;
      case 'error':
        statusClass = 'text-danger';
        statusText = 'Connection Error';
        statusIcon = 'fas fa-exclamation-circle';
        break;
      default:
        statusClass = 'text-muted';
        statusText = 'Connecting...';
        statusIcon = 'fas fa-spinner fa-spin';
    }

    statusElement.className = statusClass;
    statusElement.innerHTML = `<i class="${statusIcon} me-1"></i>${statusText}`;
  }

  renderApp() {
    const root = document.getElementById('root');
    root.innerHTML = `
      <div class="App">
        <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
          <div class="container-fluid">
            <a class="navbar-brand" href="#">
              <i class="fas fa-shield-alt me-2"></i>
              SSL Certificate Manager
            </a>
            <div class="navbar-nav ms-auto">
              <span class="navbar-text" id="connection-status">
                <i class="fas fa-spinner fa-spin me-1"></i>Connecting...
              </span>
            </div>
          </div>
        </nav>
        
        <div id="notification-container" class="notification-container"></div>
        
        <div class="container-fluid mt-4">
          <div id="main-content"></div>
        </div>
      </div>
    `;
  }

  renderDashboard() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;
    
    mainContent.innerHTML = `
      <div class="row">
        <!-- Statistics Cards -->
        <div class="col-12 mb-4">
          <div class="row">
            <div class="col-md-3 mb-3">
              <div class="card bg-primary text-white">
                <div class="card-body">
                  <div class="d-flex align-items-center">
                    <div class="flex-grow-1">
                      <h6 class="card-title mb-0">Total Domains</h6>
                      <h2 class="mb-0" id="stat-total">-</h2>
                    </div>
                    <div class="ms-3">
                      <i class="fas fa-globe fa-2x opacity-75"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <div class="card bg-success text-white">
                <div class="card-body">
                  <div class="d-flex align-items-center">
                    <div class="flex-grow-1">
                      <h6 class="card-title mb-0">With SSL</h6>
                      <h2 class="mb-0" id="stat-ssl">-</h2>
                    </div>
                    <div class="ms-3">
                      <i class="fas fa-lock fa-2x opacity-75"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <div class="card bg-warning text-white">
                <div class="card-body">
                  <div class="d-flex align-items-center">
                    <div class="flex-grow-1">
                      <h6 class="card-title mb-0">Expiring Soon</h6>
                      <h2 class="mb-0" id="stat-expiring">-</h2>
                    </div>
                    <div class="ms-3">
                      <i class="fas fa-clock fa-2x opacity-75"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <div class="card bg-danger text-white">
                <div class="card-body">
                  <div class="d-flex align-items-center">
                    <div class="flex-grow-1">
                      <h6 class="card-title mb-0">Expired</h6>
                      <h2 class="mb-0" id="stat-expired">-</h2>
                    </div>
                    <div class="ms-3">
                      <i class="fas fa-exclamation-triangle fa-2x opacity-75"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Domain Management -->
        <div class="col-lg-8">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h5 class="mb-0">Domain Management</h5>
              <div class="d-flex gap-2">
                <button class="btn btn-outline-primary btn-sm" onclick="sslManager.refreshDomains()">
                  <i class="fas fa-sync-alt me-1"></i> Refresh
                </button>
                <button class="btn btn-primary btn-sm" onclick="sslManager.toggleAddDomainForm()">
                  <i class="fas fa-plus me-1"></i> Add Domain
                </button>
              </div>
            </div>
            <div class="card-body">
              <!-- Search and Filter Controls -->
              <div class="row mb-3">
                <div class="col-md-6">
                  <div class="input-group">
                    <span class="input-group-text"><i class="fas fa-search"></i></span>
                    <input type="text" class="form-control" id="search-input" placeholder="Search domains...">
                  </div>
                </div>
                <div class="col-md-3">
                  <select class="form-select" id="status-filter">
                    <option value="all">All Statuses</option>
                    <option value="ssl">With SSL</option>
                    <option value="no-ssl">No SSL</option>
                    <option value="expiring">Expiring Soon</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
                <div class="col-md-3">
                  <select class="form-select" id="sort-select">
                    <option value="domain-asc">Domain A-Z</option>
                    <option value="domain-desc">Domain Z-A</option>
                    <option value="expiry-asc">Expiry Date (Earliest)</option>
                    <option value="expiry-desc">Expiry Date (Latest)</option>
                    <option value="status-desc">SSL Status</option>
                  </select>
                </div>
              </div>

              <!-- Add Domain Form (Initially Hidden) -->
              <div id="add-domain-form" class="alert alert-light border" style="display: none;">
                <h6 class="alert-heading">Add New Domain</h6>
                <div class="row">
                  <div class="col-md-8">
                    <input type="text" id="new-domain-input" class="form-control" placeholder="Enter domain (e.g., example.com)">
                    <div id="domain-validation-message" class="form-text"></div>
                  </div>
                  <div class="col-md-4">
                    <button class="btn btn-success me-2" onclick="sslManager.addDomainFromForm()">
                      <i class="fas fa-plus me-1"></i> Add Domain
                    </button>
                    <button class="btn btn-secondary" onclick="sslManager.toggleAddDomainForm()">Cancel</button>
                  </div>
                </div>
              </div>

              <!-- Domain List Container -->
              <div id="domain-list-container">
                <!-- Domain list will be rendered here -->
              </div>

              <!-- Pagination -->
              <div id="pagination-container" class="mt-3">
                <!-- Pagination will be rendered here -->
              </div>
            </div>
          </div>
        </div>

        <!-- SSL Panel -->
        <div class="col-lg-4">
          <div id="ssl-panel-container">
            <!-- SSL panel will be rendered here -->
          </div>
        </div>
      </div>
    `;
  }

  renderLoading() {
    const container = document.getElementById('domain-list-container');
    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-3 text-muted">Loading domains...</p>
      </div>
    `;
  }

  safeSetContent(elementId, content) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = content;
    }
  }

  safeSetText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = text;
    }
  }

  renderDomainList() {
    const container = document.getElementById('domain-list-container');
    if (!container) return;

    if (this.loading) {
      this.renderLoading();
      return;
    }

    const currentPageDomains = this.getCurrentPageDomains();

    if (currentPageDomains.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5">
          <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
          <h5 class="text-muted">No domains found</h5>
          <p class="text-muted">Add your first domain to get started</p>
        </div>
      `;
      this.renderPagination();
      return;
    }

    const tableHTML = `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead class="table-light">
            <tr>
              <th>Domain</th>
              <th>SSL Status</th>
              <th>Expiry</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${currentPageDomains.map(domain => `
              <tr class="${this.selectedDomain?.domain === domain.domain ? 'table-active' : ''}" 
                  onclick="sslManager.selectDomain(${JSON.stringify(domain).replace(/"/g, '&quot;')})">
                <td>
                  <div>
                    <strong>${domain.domain}</strong>
                    ${domain.serverNames && domain.serverNames.length > 1 ? 
                      `<br><small class="text-muted">+${domain.serverNames.length - 1} aliases</small>` : ''}
                  </div>
                </td>
                <td>${this.renderSSLStatus(domain)}</td>
                <td>${this.formatExpiryDate(domain.ssl)}</td>
                <td>
                  ${this.renderCertificateActions(domain)}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = tableHTML;
    this.renderPagination();
  }

  renderPagination() {
    const container = document.getElementById('pagination-container');
    if (!container) return;

    if (this.totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    const maxVisiblePages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    let paginationHTML = `
      <nav aria-label="Domain pagination">
        <ul class="pagination justify-content-center">
          <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="event.preventDefault(); sslManager.setPage(${this.currentPage - 1})">
              <i class="fas fa-chevron-left"></i>
            </a>
          </li>
    `;

    if (startPage > 1) {
      paginationHTML += `
        <li class="page-item">
          <a class="page-link" href="#" onclick="event.preventDefault(); sslManager.setPage(1)">1</a>
        </li>
      `;
      if (startPage > 2) {
        paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
      }
    }

    for (let page = startPage; page <= endPage; page++) {
      paginationHTML += `
        <li class="page-item ${page === this.currentPage ? 'active' : ''}">
          <a class="page-link" href="#" onclick="event.preventDefault(); sslManager.setPage(${page})">${page}</a>
        </li>
      `;
    }

    if (endPage < this.totalPages) {
      if (endPage < this.totalPages - 1) {
        paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
      }
      paginationHTML += `
        <li class="page-item">
          <a class="page-link" href="#" onclick="event.preventDefault(); sslManager.setPage(${this.totalPages})">${this.totalPages}</a>
        </li>
      `;
    }

    paginationHTML += `
          <li class="page-item ${this.currentPage === this.totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="event.preventDefault(); sslManager.setPage(${this.currentPage + 1})">
              <i class="fas fa-chevron-right"></i>
            </a>
          </li>
        </ul>
      </nav>
      <div class="text-center text-muted">
        Showing ${((this.currentPage - 1) * this.itemsPerPage) + 1} to ${Math.min(this.currentPage * this.itemsPerPage, this.filteredDomains.length)} of ${this.filteredDomains.length} domains
      </div>
    `;

    container.innerHTML = paginationHTML;
  }

  renderSSLPanel() {
    const container = document.getElementById('ssl-panel-container');
    if (!container) return;

    if (!this.selectedDomain) {
      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h6 class="mb-0"><i class="fas fa-shield-alt me-2"></i>SSL Certificate Details</h6>
          </div>
          <div class="card-body text-center">
            <i class="fas fa-mouse-pointer fa-3x text-muted mb-3"></i>
            <p class="text-muted">Select a domain to view SSL certificate details</p>
          </div>
        </div>
      `;
      return;
    }

    const domain = this.selectedDomain;
    const ssl = domain.ssl;

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h6 class="mb-0"><i class="fas fa-shield-alt me-2"></i>SSL Certificate Details</h6>
        </div>
        <div class="card-body">
          <h6 class="border-bottom pb-2 mb-3">${domain.domain}</h6>
          
          <div class="mb-3">
            <label class="form-label fw-bold">Status</label>
            <div>${this.renderSSLStatus(domain)}</div>
          </div>

          ${ssl?.hasSSL ? `
            <div class="mb-3">
              <label class="form-label fw-bold">Certificate Information</label>
              <div class="small">
                <div class="row mb-1">
                  <div class="col-4 text-muted">Issuer:</div>
                  <div class="col-8">${ssl.issuer || 'Let\'s Encrypt'}</div>
                </div>
                <div class="row mb-1">
                  <div class="col-4 text-muted">Valid From:</div>
                  <div class="col-8">${new Date(ssl.validFrom || ssl.expiryDate).toLocaleDateString()}</div>
                </div>
                <div class="row mb-1">
                  <div class="col-4 text-muted">Expires:</div>
                  <div class="col-8">${new Date(ssl.expiryDate).toLocaleDateString()}</div>
                </div>
                <div class="row mb-1">
                  <div class="col-4 text-muted">Days Remaining:</div>
                  <div class="col-8">
                    <span class="badge ${this.getDaysUntilExpiry(ssl) <= 30 ? 'bg-warning' : 'bg-success'}">
                      ${this.getDaysUntilExpiry(ssl)} days
                    </span>
                  </div>
                </div>
                ${ssl.certificatePath ? `
                  <div class="row mb-1">
                    <div class="col-4 text-muted">Path:</div>
                    <div class="col-8 font-monospace">${ssl.certificatePath}</div>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}

          <div class="mb-3">
            <label class="form-label fw-bold">Actions</label>
            <div class="d-grid gap-2">
              ${!ssl?.hasSSL ? `
                <button class="btn btn-success" onclick="sslManager.toggleInstallForm('${domain.domain}')">
                  <i class="fas fa-plus me-1"></i> Install SSL Certificate
                </button>
              ` : `
                <button class="btn btn-warning" onclick="sslManager.renewSSL('${domain.domain}')">
                  <i class="fas fa-sync-alt me-1"></i> Renew Certificate
                </button>
              `}
              <button class="btn btn-danger" onclick="sslManager.deleteDomain('${domain.domain}')">
                <i class="fas fa-trash me-1"></i> Delete Domain
              </button>
            </div>
          </div>

          <!-- SSL Installation Form (Initially Hidden) -->
          <div id="ssl-install-form-${domain.domain}" class="alert alert-light border" style="display: none;">
            <h6 class="alert-heading">Install SSL Certificate</h6>
            <div class="mb-3">
              <label for="ssl-email-${domain.domain}" class="form-label">Email Address</label>
              <input type="email" id="ssl-email-${domain.domain}" class="form-control" placeholder="your@email.com" required>
              <div class="form-text">Required for Let's Encrypt certificate registration</div>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-success" onclick="sslManager.installSSLFromForm('${domain.domain}')">
                <i class="fas fa-shield-alt me-1"></i> Install Certificate
              </button>
              <button class="btn btn-secondary" onclick="sslManager.toggleInstallForm('${domain.domain}')">Cancel</button>
            </div>
          </div>

          <div class="mt-3">
            <label class="form-label fw-bold">Domain Configuration</label>
            <div class="small">
              <div class="row mb-1">
                <div class="col-4 text-muted">Config File:</div>
                <div class="col-8 font-monospace">${domain.filename}</div>
              </div>
              <div class="row mb-1">
                <div class="col-4 text-muted">Document Root:</div>
                <div class="col-8 font-monospace">${domain.documentRoot || '/var/www/html'}</div>
              </div>
              <div class="row mb-1">
                <div class="col-4 text-muted">Status:</div>
                <div class="col-8">
                  <span class="badge ${domain.enabled ? 'bg-success' : 'bg-secondary'}">
                    ${domain.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
              <div class="row mb-1">
                <div class="col-4 text-muted">Ports:</div>
                <div class="col-8">${domain.ports ? domain.ports.join(', ') : '80'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderSSLStatus(domain) {
    const ssl = domain.ssl;
    if (!ssl) {
      return '<span class="badge bg-secondary">Unknown</span>';
    }

    return this.getSSLStatusBadge(ssl);
  }

  renderCertificateActions(domain) {
    const ssl = domain.ssl;
    
    return `
      <div class="btn-group" role="group">
        ${!ssl?.hasSSL ? `
          <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); sslManager.toggleInstallForm('${domain.domain}')" title="Install SSL Certificate">
            <i class="fas fa-plus me-1"></i> Install SSL
          </button>
        ` : `
          <button class="btn btn-warning btn-sm" onclick="event.stopPropagation(); sslManager.renewSSL('${domain.domain}')" title="Renew SSL Certificate">
            <i class="fas fa-sync-alt me-1"></i> Renew
          </button>
        `}
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); sslManager.deleteDomain('${domain.domain}')" title="Delete Domain">
          <i class="fas fa-trash me-1"></i> Delete
        </button>
      </div>
    `;
  }

  toggleInstallForm(domain) {
    const form = document.getElementById(`ssl-install-form-${domain}`);
    if (form) {
      const isVisible = form.style.display !== 'none';
      form.style.display = isVisible ? 'none' : 'block';
      
      if (!isVisible) {
        const emailInput = document.getElementById(`ssl-email-${domain}`);
        if (emailInput) {
          emailInput.focus();
        }
      }
    }
  }

  async installSSLFromForm(domain) {
    const emailInput = document.getElementById(`ssl-email-${domain}`);
    if (!emailInput) return;

    const email = emailInput.value.trim();
    if (!email) {
      this.addNotification('error', 'Email address is required', true);
      emailInput.focus();
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      this.addNotification('error', 'Please enter a valid email address', true);
      emailInput.focus();
      return;
    }

    this.toggleInstallForm(domain);
    await this.installSSL(domain, email);
  }

  toggleAddDomainForm() {
    const form = document.getElementById('add-domain-form');
    if (form) {
      const isVisible = form.style.display !== 'none';
      form.style.display = isVisible ? 'none' : 'block';
      
      if (!isVisible) {
        const domainInput = document.getElementById('new-domain-input');
        if (domainInput) {
          domainInput.focus();
        }
      } else {
        // Clear form when hiding
        const domainInput = document.getElementById('new-domain-input');
        const validationMessage = document.getElementById('domain-validation-message');
        if (domainInput) domainInput.value = '';
        if (validationMessage) validationMessage.textContent = '';
      }
    }
  }

  validateDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return { valid: false, error: 'Domain must be a valid string' };
    }

    // Remove protocol if present
    domain = domain.replace(/^https?:\/\//, '');
    
    // Remove trailing slash
    domain = domain.replace(/\/$/, '');
    
    // Check for valid domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!domainRegex.test(domain)) {
      return { valid: false, error: 'Invalid domain format' };
    }

    // Check length
    if (domain.length > 253) {
      return { valid: false, error: 'Domain name too long' };
    }

    // Check for minimum valid domain (must have at least one dot)
    if (!domain.includes('.')) {
      return { valid: false, error: 'Domain must include at least one dot (e.g., example.com)' };
    }

    return { valid: true, domain: domain };
  }

  async addDomainFromForm() {
    const domainInput = document.getElementById('new-domain-input');
    const validationMessage = document.getElementById('domain-validation-message');
    
    if (!domainInput || !validationMessage) return;

    const domain = domainInput.value.trim();
    
    // Clear previous validation message
    validationMessage.textContent = '';
    validationMessage.className = 'form-text';

    if (!domain) {
      this.showValidationMessage('Domain is required', 'error');
      domainInput.focus();
      return;
    }

    // Validate domain format
    const validation = this.validateDomain(domain);
    if (!validation.valid) {
      this.showValidationMessage(validation.error, 'error');
      domainInput.focus();
      return;
    }

    // Check if domain already exists
    const existingDomain = this.domains.find(d => d.domain === validation.domain);
    if (existingDomain) {
      this.showValidationMessage('Domain already exists', 'error');
      domainInput.focus();
      return;
    }

    try {
      this.addNotification('info', `Adding domain ${validation.domain}...`, false);
      
      const response = await this.api('POST', '/domains/add', { domain: validation.domain });
      
      if (response.success) {
        this.addNotification('success', `Domain ${validation.domain} added successfully`, true);
        
        // Clear form and hide it
        domainInput.value = '';
        this.toggleAddDomainForm();
        
        // Refresh domain list
        await this.loadDomains();
      } else {
        this.addNotification('error', `Failed to add domain: ${response.error}`, true);
      }
    } catch (error) {
      console.error('Domain addition error:', error);
      this.addNotification('error', `Domain addition failed: ${error.message}`, true);
    }
  }

  async deleteDomain(domain) {
    // Show confirmation dialog
    const confirmed = confirm(
      `Are you sure you want to delete "${domain}"?\n\n` +
      `This will permanently remove:\n` +
      `• Nginx configuration files\n` +
      `• SSL certificates\n` +
      `• All associated data\n\n` +
      `This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      this.addNotification('info', `Deleting domain ${domain}...`, false);
      
      const response = await this.api('DELETE', `/domains/delete/${domain}`);
      
      if (response.success) {
        this.addNotification('success', `Domain ${domain} deleted successfully`, true);
        
        // Clear selected domain if it was the deleted one
        if (this.selectedDomain?.domain === domain) {
          this.selectedDomain = null;
        }
        
        // Refresh domain list
        await this.loadDomains();
      } else {
        this.addNotification('error', `Failed to delete domain: ${response.error}`, true);
      }
    } catch (error) {
      console.error('Domain deletion error:', error);
      this.addNotification('error', `Domain deletion failed: ${error.message}`, true);
    }
  }

  showValidationMessage(message, type) {
    const validationMessage = document.getElementById('domain-validation-message');
    if (validationMessage) {
      validationMessage.textContent = message;
      validationMessage.className = `form-text ${type === 'error' ? 'text-danger' : 'text-success'}`;
    }
  }

  renderNotifications() {
    const container = document.getElementById('notification-container');
    if (!container) return;

    container.innerHTML = this.notifications.map(notification => `
      <div class="alert alert-${this.getNotificationClass(notification.type)} alert-dismissible fade show" role="alert">
        <div class="d-flex align-items-center">
          <i class="${this.getNotificationIcon(notification.type)} me-2"></i>
          <div class="flex-grow-1">${notification.message}</div>
          <button type="button" class="btn-close" onclick="sslManager.removeNotification(${notification.id})"></button>
        </div>
      </div>
    `).join('');
  }

  getNotificationClass(type) {
    const classes = {
      success: 'success',
      error: 'danger',
      warning: 'warning',
      info: 'info'
    };
    return classes[type] || 'info';
  }

  getNotificationIcon(type) {
    const icons = {
      success: 'fas fa-check-circle',
      error: 'fas fa-exclamation-circle',
      warning: 'fas fa-exclamation-triangle',
      info: 'fas fa-info-circle'
    };
    return icons[type] || 'fas fa-info-circle';
  }

  bindEvents() {
    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.setSearch(e.target.value);
      });
    }

    // Status filter
    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        this.setStatusFilter(e.target.value);
      });
    }

    // Sort select
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.setSorting(sortBy, sortOrder);
      });
    }

    // Domain input validation
    const newDomainInput = document.getElementById('new-domain-input');
    if (newDomainInput) {
      newDomainInput.addEventListener('input', (e) => {
        const domain = e.target.value.trim();
        const validationMessage = document.getElementById('domain-validation-message');
        
        if (!validationMessage) return;
        
        if (!domain) {
          validationMessage.textContent = '';
          return;
        }

        const validation = this.validateDomain(domain);
        if (validation.valid) {
          validationMessage.textContent = `✓ Valid domain: ${validation.domain}`;
          validationMessage.className = 'form-text text-success';
        } else {
          validationMessage.textContent = validation.error;
          validationMessage.className = 'form-text text-danger';
        }
      });

      newDomainInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addDomainFromForm();
        }
      });
    }
  }

  getSSLStatusBadge(ssl) {
    if (!ssl) {
      return '<span class="badge bg-secondary">Unknown</span>';
    }

    if (!ssl.hasSSL) {
      return '<span class="badge bg-danger">No SSL</span>';
    }

    if (ssl.isExpired) {
      return '<span class="badge bg-danger">Expired</span>';
    }

    if (ssl.isExpiringSoon) {
      return '<span class="badge bg-warning">Expiring Soon</span>';
    }

    return '<span class="badge bg-success">Active SSL</span>';
  }

  getSSLIcon(ssl) {
    if (!ssl || !ssl.hasSSL) {
      return 'fas fa-unlock text-danger';
    }

    if (ssl.isExpired) {
      return 'fas fa-exclamation-triangle text-danger';
    }

    if (ssl.isExpiringSoon) {
      return 'fas fa-clock text-warning';
    }

    return 'fas fa-lock text-success';
  }

  formatExpiryDate(ssl) {
    if (!ssl || !ssl.hasSSL || !ssl.expiryDate) {
      return '<span class="text-muted">-</span>';
    }

    const expiryDate = new Date(ssl.expiryDate);
    const daysRemaining = this.getDaysUntilExpiry(ssl);
    
    let className = 'text-muted';
    if (ssl.isExpired) {
      className = 'text-danger';
    } else if (ssl.isExpiringSoon) {
      className = 'text-warning';
    }

    return `
      <div class="${className}">
        <div>${expiryDate.toLocaleDateString()}</div>
        <small>(${daysRemaining} days)</small>
      </div>
    `;
  }

  getDaysUntilExpiry(ssl) {
    if (!ssl || !ssl.expiryDate) return 0;
    
    const now = new Date();
    const expiry = new Date(ssl.expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  }
}

// Initialize the SSL Manager when DOM is ready
let sslManager;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    sslManager = new SSLManager();
  });
} else {
  sslManager = new SSLManager();
}