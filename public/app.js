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
    this.activeTab = 'domains'; // 'domains', 'autorenewal', or 'settings'
    this.autorenewalData = null;
    this.cloudnsStatus = null;
    
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
    // Use local development server for testing
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocal) {
      const localApiUrl = `${window.location.protocol}//${window.location.host}`;
      console.log('Using local API server:', localApiUrl);
      return localApiUrl;
    } else {
      const productionApiUrl = 'https://sitedev.eezix.com';
      console.log('Using production API server:', productionApiUrl);
      return productionApiUrl;
    }
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
    // Configure Socket.IO connection
    const socketOptions = {
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000,
      forceNew: false
    };
    
    // Use appropriate server based on environment
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const socketUrl = isLocal ? `${window.location.protocol}//${window.location.host}` : 'https://sitedev.eezix.com';
    
    this.socket = io(socketUrl, socketOptions);
    
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
      this.addNotification('success', `SSL certificate installed successfully for ${data.domain} using ${data.method} method`, true);
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

    // Autorenewal listeners
    this.socket.on('autorenewal_settings_updated', (data) => {
      this.addNotification('success', 'Autorenewal settings updated successfully', true);
      this.loadAutorenewalData();
    });

    this.socket.on('autorenewal_domain_toggled', (data) => {
      this.addNotification('info', `Autorenewal ${data.enabled ? 'enabled' : 'disabled'} for ${data.domain}`, true);
      this.loadAutorenewalData();
    });

    this.socket.on('autorenewal_check_started', () => {
      this.addNotification('info', 'Starting SSL renewal check for all domains...', false);
    });

    this.socket.on('autorenewal_check_completed', (data) => {
      this.addNotification('success', `Renewal check completed: ${data.checked} checked, ${data.renewed} renewed`, true);
      this.loadAutorenewalData();
    });

    this.socket.on('autorenewal_check_error', (data) => {
      this.addNotification('error', `Renewal check failed: ${data.error}`, true);
    });
  }

  async api(method, url, data = null, options = {}) {
    try {
      const finalUrl = `${this.apiBaseUrl}/api${url}`;
      console.log(`Making ${method} request to: ${finalUrl}`);
      
      const config = {
        method,
        url: finalUrl,
        timeout: options.timeout || 60000,
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

  async loadAutorenewalData() {
    try {
      const response = await this.api('GET', '/autorenewal/status');
      
      // Ensure response has the expected structure
      if (response && typeof response === 'object') {
        this.autorenewalData = response;
      } else {
        // Fallback for invalid response
        this.autorenewalData = {
          success: true,
          config: {
            globalEnabled: true,
            renewalDays: 30,
            checkFrequency: 'daily',
            lastCheck: null
          },
          domains: [],
          statistics: {
            totalDomains: 0,
            domainsWithSSL: 0,
            autorenewalEnabled: 0,
            needingRenewal: 0,
            totalRenewals: 0,
            failedRenewals: 0
          }
        };
      }
      
      if (this.activeTab === 'autorenewal') {
        this.renderAutorenewalTab();
      }
    } catch (error) {
      console.error('Error loading autorenewal data:', error);
      
      // Create fallback data structure
      this.autorenewalData = {
        success: true,
        config: {
          globalEnabled: true,
          renewalDays: 30,
          checkFrequency: 'daily',
          lastCheck: null
        },
        domains: [],
        statistics: {
          totalDomains: 0,
          domainsWithSSL: 0,
          autorenewalEnabled: 0,
          needingRenewal: 0,
          totalRenewals: 0,
          failedRenewals: 0
        }
      };
      
      if (this.activeTab === 'autorenewal') {
        this.renderAutorenewalTab();
      }
      
      this.addNotification('warning', 'Autorenewal system initialized with default settings', true);
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
    await this.loadDomains();
  }

  async installSSL(domain, email, method = 'nginx') {
    try {
      const methodLabel = method === 'dns' ? 'DNS challenge' : 'nginx verification';
      this.addNotification('info', `Starting SSL installation for ${domain} using ${methodLabel}...`, false);
      
      // Set longer timeout for DNS method
      const timeout = method === 'dns' ? 180000 : 120000; // 3 minutes for DNS, 2 minutes for nginx
      
      const response = await this.api('POST', '/ssl/install', { domain, email, method }, { timeout });
      
      if (response.success) {
        this.addNotification('success', `SSL installation started for ${domain} using ${methodLabel}`, false);
      } else {
        this.addNotification('error', `Failed to start SSL installation: ${response.error}`, true);
      }
    } catch (error) {
      console.error('SSL installation error:', error);
      
      if (error.code === 'ECONNABORTED' && method === 'dns') {
        this.addNotification('error', `DNS SSL installation timed out for ${domain}. CloudNS credentials may not be configured. Try nginx method instead.`, true);
      } else if (error.code === 'ECONNABORTED') {
        this.addNotification('error', `SSL installation timed out for ${domain}. Server may be busy.`, true);
      } else if (error.response?.status === 400 && method === 'dns') {
        this.addNotification('error', `DNS method not available: ${error.response.data?.message || error.message}. Please use nginx method.`, true);
      } else if (error.response?.data?.message) {
        this.addNotification('error', `SSL installation failed: ${error.response.data.message}`, true);
      } else {
        this.addNotification('error', `SSL installation failed: ${error.message}`, true);
      }
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
      <!-- Navigation Tabs -->
      <div class="row mb-4">
        <div class="col-12">
          <div class="card">
            <div class="card-header">
              <ul class="nav nav-tabs card-header-tabs" role="tablist">
                <li class="nav-item" role="presentation">
                  <button class="nav-link ${this.activeTab === 'domains' ? 'active' : ''}" 
                          type="button" onclick="sslManager.switchTab('domains')">
                    <i class="fas fa-globe me-1"></i> Domain Management
                  </button>
                </li>
                <li class="nav-item" role="presentation">
                  <button class="nav-link ${this.activeTab === 'autorenewal' ? 'active' : ''}" 
                          type="button" onclick="sslManager.switchTab('autorenewal')">
                    <i class="fas fa-sync-alt me-1"></i> SSL Autorenewal
                    <span class="badge bg-success ms-1" id="autorenewal-badge">-</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab Content -->
      <div id="tab-content">
        <!-- Content will be rendered here based on active tab -->
      </div>
    `;
    
    // Load appropriate tab content
    if (this.activeTab === 'domains') {
      this.renderDomainsTab();
    } else if (this.activeTab === 'autorenewal') {
      this.renderAutorenewalTab();
    }
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.renderDashboard();
    
    if (tab === 'domains') {
      this.loadDomains();
    } else if (tab === 'autorenewal') {
      this.loadAutorenewalData();
    }
  }

  renderDomainsTab() {
    const tabContent = document.getElementById('tab-content');
    if (!tabContent) return;
    
    tabContent.innerHTML = `
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
              <tr id="ssl-install-form-row-${domain.domain}" style="display: none;">
                <td colspan="4">
                  <div class="alert alert-light border m-2">
                    <h6 class="alert-heading">Install SSL Certificate for ${domain.domain}</h6>
                    <div class="row">
                      <div class="col-md-4">
                        <div class="mb-3">
                          <label for="ssl-email-${domain.domain}" class="form-label">Email Address</label>
                          <input type="email" id="ssl-email-${domain.domain}" class="form-control" placeholder="your@email.com" required>
                          <div class="form-text">Required for Let's Encrypt certificate registration</div>
                        </div>
                      </div>
                      <div class="col-md-4">
                        <div class="mb-3">
                          <label for="ssl-method-${domain.domain}" class="form-label">Installation Method</label>
                          <select id="ssl-method-${domain.domain}" class="form-select">
                            <option value="nginx" selected>Nginx Method (Recommended)</option>
                            <option value="dns">DNS Method (CloudNS) - Beta</option>
                          </select>
                          <div class="form-text">
                            <strong>Nginx:</strong> Web server verification (fully supported)<br>
                            <strong>DNS:</strong> DNS challenge via CloudNS (requires configuration)
                          </div>
                        </div>
                      </div>
                      <div class="col-md-4">
                        <div class="mb-3">
                          <label class="form-label">&nbsp;</label>
                          <div class="d-flex gap-2">
                            <button class="btn btn-success" onclick="event.stopPropagation(); sslManager.installSSLFromForm('${domain.domain}')">
                              <i class="fas fa-shield-alt me-1"></i> Install Certificate
                            </button>
                            <button class="btn btn-secondary" onclick="event.stopPropagation(); sslManager.toggleInstallForm('${domain.domain}')">Cancel</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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
              ${ssl?.hasSSL ? `
                <button class="btn btn-warning" onclick="sslManager.renewSSL('${domain.domain}')">
                  <i class="fas fa-sync-alt me-1"></i> Renew Certificate
                </button>
              ` : ''}
              <button class="btn btn-danger" onclick="sslManager.deleteDomain('${domain.domain}')">
                <i class="fas fa-trash me-1"></i> Delete Domain
              </button>
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
    const formRow = document.getElementById(`ssl-install-form-row-${domain}`);
    if (formRow) {
      const isVisible = formRow.style.display !== 'none';
      formRow.style.display = isVisible ? 'none' : 'table-row';
      
      if (!isVisible) {
        const emailInput = document.getElementById(`ssl-email-${domain}`);
        if (emailInput) {
          setTimeout(() => emailInput.focus(), 100);
        }
      }
    }
  }

  async installSSLFromForm(domain) {
    const emailInput = document.getElementById(`ssl-email-${domain}`);
    const methodSelect = document.getElementById(`ssl-method-${domain}`);
    
    if (!emailInput || !methodSelect) return;

    const email = emailInput.value.trim();
    const method = methodSelect.value;
    
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
    await this.installSSL(domain, email, method);
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
      `• SSL certificates (if present)\n` +
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

  // Autorenewal Management Methods
  renderAutorenewalTab() {
    const tabContent = document.getElementById('tab-content');
    if (!tabContent) return;

    if (!this.autorenewalData) {
      tabContent.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p class="mt-3 text-muted">Loading autorenewal data...</p>
        </div>
      `;
      return;
    }

    const stats = this.autorenewalData.statistics;
    const config = this.autorenewalData.config;
    const domains = this.autorenewalData.domains || [];

    tabContent.innerHTML = `
      <div class="row">
        <!-- Summary Cards -->
        <div class="col-12 mb-4">
          <div class="row">
            <div class="col-md-3">
              <div class="card bg-success text-white">
                <div class="card-body">
                  <div class="d-flex align-items-center">
                    <div class="flex-grow-1">
                      <h6 class="card-title mb-0">Active Renewals</h6>
                      <h2 class="mb-0">${stats.autorenewalEnabled || 0}</h2>
                    </div>
                    <div class="ms-3">
                      <i class="fas fa-check-circle fa-2x opacity-75"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="card bg-warning text-white">
                <div class="card-body">
                  <div class="d-flex align-items-center">
                    <div class="flex-grow-1">
                      <h6 class="card-title mb-0">Needing Renewal</h6>
                      <h2 class="mb-0">${stats.needingRenewal || 0}</h2>
                    </div>
                    <div class="ms-3">
                      <i class="fas fa-clock fa-2x opacity-75"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="card bg-info text-white">
                <div class="card-body">
                  <div class="d-flex align-items-center">
                    <div class="flex-grow-1">
                      <h6 class="card-title mb-0">Total Renewals</h6>
                      <h2 class="mb-0">${stats.totalRenewals || 0}</h2>
                    </div>
                    <div class="ms-3">
                      <i class="fas fa-history fa-2x opacity-75"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="card bg-danger text-white">
                <div class="card-body">
                  <div class="d-flex align-items-center">
                    <div class="flex-grow-1">
                      <h6 class="card-title mb-0">Failed</h6>
                      <h2 class="mb-0">${stats.failedRenewals || 0}</h2>
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

        <!-- Global Settings -->
        <div class="col-12 mb-4">
          <div class="card">
            <div class="card-header">
              <h5 class="mb-0">Global Autorenewal Settings</h5>
            </div>
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="globalAutoRenewal" 
                           ${config.globalEnabled ? 'checked' : ''} 
                           onchange="sslManager.updateGlobalSettings()">
                    <label class="form-check-label fw-bold" for="globalAutoRenewal">
                      <i class="fas fa-globe me-1"></i> Enable Global Autorenewal
                    </label>
                  </div>
                  <small class="text-muted">Automatically renew SSL certificates before expiry</small>
                </div>
                <div class="col-md-3">
                  <label class="form-label">Renewal Days Before Expiry</label>
                  <input type="number" class="form-control" id="renewalDays" 
                         value="${config.renewalDays}" min="1" max="89" 
                         onchange="sslManager.updateGlobalSettings()">
                </div>
                <div class="col-md-3">
                  <label class="form-label">Check Frequency</label>
                  <select class="form-select" id="checkFrequency" onchange="sslManager.updateGlobalSettings()">
                    <option value="daily" ${config.checkFrequency === 'daily' ? 'selected' : ''}>Daily</option>
                    <option value="weekly" ${config.checkFrequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                    <option value="hourly" ${config.checkFrequency === 'hourly' ? 'selected' : ''}>Hourly</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Domain Status Table -->
        <div class="col-12">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h5 class="mb-0">Domain Autorenewal Status</h5>
              <div class="d-flex gap-2">
                <button class="btn btn-outline-primary btn-sm" onclick="sslManager.loadAutorenewalData()">
                  <i class="fas fa-sync-alt me-1"></i> Refresh Status
                </button>
                <button class="btn btn-success btn-sm" onclick="sslManager.runRenewalCheck()">
                  <i class="fas fa-play me-1"></i> Run Check Now
                </button>
              </div>
            </div>
            <div class="card-body">
              ${this.renderAutorenewalTable(domains)}
            </div>
          </div>
        </div>
      </div>
    `;

    // Update the badge in the tab
    const badge = document.getElementById('autorenewal-badge');
    if (badge) {
      badge.textContent = `${stats.autorenewalEnabled || 0} Active`;
    }
  }

  renderAutorenewalTable(domains) {
    if (domains.length === 0) {
      return `
        <div class="text-center py-5">
          <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
          <h5 class="text-muted">No domains found</h5>
          <p class="text-muted">Add domains to manage SSL autorenewal</p>
        </div>
      `;
    }

    return `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead class="table-light">
            <tr>
              <th>Domain</th>
              <th>Autorenewal Status</th>
              <th>SSL Expiry</th>
              <th>Next Check</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${domains.map(domain => this.renderAutorenewalRow(domain)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderAutorenewalRow(domain) {
    const ssl = domain.ssl;
    const autorenewal = domain.autorenewal;
    
    let statusBadge, expiryDisplay, nextCheck, actions;

    if (!ssl?.hasSSL) {
      statusBadge = '<span class="badge bg-secondary"><i class="fas fa-times-circle me-1"></i> N/A</span>';
      expiryDisplay = '<span class="text-muted"><i class="fas fa-minus me-1"></i> No SSL</span>';
      nextCheck = '<span class="text-muted">-</span>';
      actions = `
        <button class="btn btn-outline-success btn-sm" onclick="sslManager.installSSLFirst('${domain.domain}')" title="Install SSL First">
          <i class="fas fa-plus me-1"></i> Install SSL
        </button>
      `;
    } else {
      statusBadge = autorenewal.enabled 
        ? '<span class="badge bg-success"><i class="fas fa-check-circle me-1"></i> Enabled</span>'
        : '<span class="badge bg-warning"><i class="fas fa-pause-circle me-1"></i> Disabled</span>';
      
      const daysRemaining = ssl.daysRemaining || 0;
      let expiryClass = 'text-success';
      if (daysRemaining <= 30) expiryClass = 'text-warning';
      if (daysRemaining <= 7) expiryClass = 'text-danger';
      
      expiryDisplay = `
        <span class="${expiryClass}">
          <i class="fas fa-shield-alt me-1"></i> ${daysRemaining} days
        </span>
        <br><small class="text-muted">${new Date(ssl.expiryDate).toLocaleDateString()}</small>
      `;
      
      nextCheck = autorenewal.nextCheck 
        ? `<span class="text-info">${this.formatRelativeDate(autorenewal.nextCheck)}</span>`
        : '<span class="text-muted">-</span>';
      
      actions = `
        <div class="btn-group" role="group">
          <button class="btn btn-outline-${autorenewal.enabled ? 'warning' : 'success'} btn-sm" 
                  onclick="sslManager.toggleDomainAutorenewal('${domain.domain}', ${!autorenewal.enabled})" 
                  title="${autorenewal.enabled ? 'Disable' : 'Enable'} Autorenewal">
            <i class="fas fa-${autorenewal.enabled ? 'pause' : 'play'}"></i>
          </button>
          <button class="btn btn-outline-primary btn-sm" 
                  onclick="sslManager.forceRenewalDomain('${domain.domain}')" 
                  title="Force Renewal">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>
      `;
    }

    return `
      <tr>
        <td>
          <strong>${domain.domain}</strong>
          <br><small class="text-muted">${ssl?.issuer || 'No SSL Certificate'}</small>
        </td>
        <td>${statusBadge}</td>
        <td>${expiryDisplay}</td>
        <td>${nextCheck}</td>
        <td>${actions}</td>
      </tr>
    `;
  }

  formatRelativeDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 1) return `${diffDays} days`;
    return 'Past due';
  }

  async updateGlobalSettings() {
    try {
      const globalEnabled = document.getElementById('globalAutoRenewal').checked;
      const renewalDays = parseInt(document.getElementById('renewalDays').value);
      const checkFrequency = document.getElementById('checkFrequency').value;
      
      const response = await this.api('POST', '/autorenewal/settings', {
        globalEnabled,
        renewalDays,
        checkFrequency
      });
      
      if (response.success) {
        this.addNotification('success', 'Autorenewal settings updated successfully', true);
      }
    } catch (error) {
      console.error('Error updating autorenewal settings:', error);
      this.addNotification('error', `Failed to update settings: ${error.message}`, true);
    }
  }

  async toggleDomainAutorenewal(domain, enabled) {
    try {
      const response = await this.api('POST', `/autorenewal/toggle/${domain}`, { enabled });
      
      if (response.success) {
        this.addNotification('success', `Autorenewal ${enabled ? 'enabled' : 'disabled'} for ${domain}`, true);
        this.loadAutorenewalData();
      }
    } catch (error) {
      console.error('Error toggling autorenewal:', error);
      this.addNotification('error', `Failed to toggle autorenewal: ${error.message}`, true);
    }
  }

  async runRenewalCheck() {
    try {
      this.addNotification('info', 'Starting SSL renewal check for all domains...', false);
      
      const response = await this.api('POST', '/autorenewal/check');
      
      if (response.success) {
        this.addNotification('success', 'Renewal check completed successfully', true);
      }
    } catch (error) {
      console.error('Error running renewal check:', error);
      this.addNotification('error', `Renewal check failed: ${error.message}`, true);
    }
  }

  async forceRenewalDomain(domain) {
    try {
      this.addNotification('info', `Starting SSL renewal for ${domain}...`, false);
      
      const response = await this.api('POST', `/autorenewal/renew/${domain}`);
      
      if (response.success) {
        this.addNotification('success', `SSL renewal initiated for ${domain}`, true);
      }
    } catch (error) {
      console.error('Error forcing renewal:', error);
      this.addNotification('error', `Renewal failed: ${error.message}`, true);
    }
  }

  installSSLFirst(domain) {
    // Switch to domains tab and highlight the domain for SSL installation
    this.switchTab('domains');
    this.addNotification('info', `Please install SSL certificate for ${domain} first`, true);
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

  showDNSConfigurationModal(data) {
    const modalHtml = `
      <div class="modal fade" id="dnsConfigModal" tabindex="-1" aria-labelledby="dnsConfigModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-xl">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="dnsConfigModalLabel">
                <i class="fas fa-certificate text-success me-2"></i>
                SSL Certificate Created for ${data.domain}
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="alert alert-success">
                <h6 class="alert-heading">Certificate Generated Successfully!</h6>
                <p class="mb-0">Your SSL certificate has been created using DNS challenge. Follow the steps below to complete the setup.</p>
              </div>
              
              <div class="card">
                <div class="card-header">
                  <h6 class="mb-0"><i class="fas fa-list-ol me-2"></i>Manual Configuration Steps</h6>
                </div>
                <div class="card-body">
                  <ol class="mb-0">
                    ${data.instructions ? data.instructions.map(instruction => `<li>${instruction}</li>`).join('') : ''}
                  </ol>
                </div>
              </div>
              
              <div class="card mt-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                  <h6 class="mb-0"><i class="fas fa-code me-2"></i>Nginx SSL Configuration</h6>
                  <button class="btn btn-sm btn-outline-secondary" onclick="navigator.clipboard.writeText(document.getElementById('nginxConfig').textContent)">
                    <i class="fas fa-copy me-1"></i>Copy Config
                  </button>
                </div>
                <div class="card-body">
                  <pre id="nginxConfig" class="bg-light p-3 rounded"><code>${data.nginxConfig || ''}</code></pre>
                </div>
              </div>
              
              <div class="alert alert-info mt-3">
                <h6 class="alert-heading">Next Steps:</h6>
                <ul class="mb-0">
                  <li>Copy the nginx configuration above</li>
                  <li>Update your site's nginx configuration file in <code>/etc/nginx/sites-available/${data.domain}</code></li>
                  <li>Test the configuration: <code>sudo nginx -t</code></li>
                  <li>Reload nginx: <code>sudo systemctl reload nginx</code></li>
                  <li>Refresh this page to see the SSL status update</li>
                </ul>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-success" data-bs-dismiss="modal">
                <i class="fas fa-check me-1"></i>Configuration Complete
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Remove existing modal if present
    const existingModal = document.getElementById('dnsConfigModal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('dnsConfigModal'));
    modal.show();
    
    // Add success notification
    this.addNotification('success', `SSL certificate created for ${data.domain}. Check configuration modal for setup instructions.`, true);
    
    // Clean up modal when hidden
    document.getElementById('dnsConfigModal').addEventListener('hidden.bs.modal', function () {
      this.remove();
    });
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