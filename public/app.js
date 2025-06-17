class SSLManager {
  constructor() {
    this.domains = [];
    this.autorenewalData = [];
    this.selectedDomain = null;
    this.socket = null;
    this.connectionStatus = 'disconnected';
    this.notifications = [];
    this.notificationCounter = 0;
    this.isAuthenticated = false;
    this.currentUser = null;
    this.activeTab = 'domains';
    
    // Pagination and filtering
    this.currentPage = 1;
    this.itemsPerPage = 10;
    this.searchTerm = '';
    this.statusFilter = 'all';
    this.sortBy = 'domain'; // domain, expiry, status
    this.sortOrder = 'asc'; // asc, desc
    
    this.init();
  }

  getApiBaseUrl() {
    // Always use current domain for API calls
    const baseUrl = `${window.location.protocol}//${window.location.host}`;
    console.log('Using API server:', baseUrl);
    return baseUrl;
  }

  async init() {
    try {
      console.log('SSL Manager initializing...');
      
      // Wait for DOM to be completely ready
      if (document.readyState === 'loading') {
        console.log('Waiting for DOM to be ready...');
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
      }
      console.log('DOM is ready');
      
      // Check authentication status first
      console.log('Checking authentication...');
      const authStatus = await this.checkAuthentication();
      console.log('Auth status:', authStatus);
      
      if (!authStatus.authenticated) {
        console.log('Not authenticated, redirecting to login...');
        window.location.href = '/login.html';
        return;
      }
      
      this.isAuthenticated = true;
      this.currentUser = authStatus.user;
      console.log('Authenticated as:', this.currentUser);
      
      // Initialize UI components in order
      console.log('Rendering app UI...');
      this.renderApp();
      this.renderDashboard();
      
      // Initialize Socket.IO after authentication
      console.log('Initializing Socket.IO...');
      this.initSocket();
      
      // Load initial data
      console.log('Loading domains...');
      this.loadDomains();
      
      // Set up event listeners
      console.log('Binding events...');
      this.bindEvents();
      
      console.log('SSL Manager initialization complete');
    } catch (error) {
      console.error('SSL Manager initialization failed:', error);
      
      // Show error message to user
      const appContainer = document.getElementById('app');
      if (appContainer) {
        appContainer.innerHTML = `
          <div class="container mt-5">
            <div class="alert alert-danger">
              <h4>Application Error</h4>
              <p>Failed to initialize SSL Manager: ${error.message}</p>
              <button class="btn btn-primary" onclick="window.location.reload()">
                Reload Page
              </button>
            </div>
          </div>
        `;
      }
    }
  }

  async ensureDOMReady() {
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }
  }

  async checkAuthentication() {
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/auth/status`, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        return { authenticated: false };
      }
    } catch (error) {
      console.error('Authentication check failed:', error);
      return { authenticated: false };
    }
  }

  async logout() {
    try {
      await fetch(`${this.getApiBaseUrl()}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      window.location.href = '/login.html';
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.href = '/login.html';
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
    const socketUrl = isLocal ? `${window.location.protocol}//${window.location.host}` : 'https://cpanel.webeezix.in';
    
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
      this.connectionStatus = 'error';
      this.updateConnectionStatus();
    });

    // SSL installation listeners
    this.socket.on('ssl_install_progress', (data) => {
      this.addNotification('info', `${data.domain}: ${data.message}`, false);
    });

    this.socket.on('ssl_install_complete', (data) => {
      this.addNotification('success', `SSL certificate installed for ${data.domain}`, true);
      this.loadDomains();
    });

    this.socket.on('ssl_install_error', (data) => {
      this.addNotification('error', `SSL installation failed for ${data.domain}: ${data.error}`, true);
    });

    // SSL renewal listeners
    this.socket.on('ssl_renew_start', (data) => {
      this.addNotification('info', `Starting SSL renewal for ${data.domain}...`, false);
    });

    this.socket.on('ssl_renew_progress', (data) => {
      this.addNotification('info', `${data.domain}: ${data.message}`, false);
    });

    this.socket.on('ssl_renew_complete', (data) => {
      this.addNotification('success', `SSL certificate renewed for ${data.domain}`, true);
      this.loadDomains();
    });

    this.socket.on('ssl_renew_error', (data) => {
      this.addNotification('error', `SSL renewal failed for ${data.domain}: ${data.error}`, true);
    });

    // Domain addition/deletion listeners
    this.socket.on('domain_added', (data) => {
      this.addNotification('success', `Domain ${data.domain} added successfully`, true);
      this.loadDomains();
    });

    this.socket.on('domain_add_error', (data) => {
      this.addNotification('error', `Failed to add domain ${data.domain}: ${data.error}`, true);
    });

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

    // SSL data refresh listener for updated certificate information
    this.socket.on('ssl_data_refreshed', (data) => {
      console.log(`SSL data refreshed for ${data.domain}:`, data.ssl);
      
      // Update domain data with fresh SSL information
      const domainIndex = this.domains.findIndex(d => d.domain === data.domain);
      if (domainIndex !== -1) {
        this.domains[domainIndex].ssl = data.ssl;
        
        // Re-render domain list and SSL panel if this domain is selected
        this.renderDomainList();
        if (this.selectedDomain === data.domain) {
          this.renderSSLPanel();
        }
        
        this.addNotification('success', `SSL certificate data updated for ${data.domain}`, true);
      }
    });

    // General domain refresh trigger
    this.socket.on('domain_refresh_needed', () => {
      console.log('Domain refresh triggered, reloading all domain data...');
      this.loadDomains();
    });
  }

  async api(method, url, data = null, options = {}) {
    try {
      const finalUrl = `${this.getApiBaseUrl()}/api${url}`;
      console.log(`Making ${method} request to: ${finalUrl}`);
      
      const config = {
        method,
        url: finalUrl,
        timeout: options.timeout || 60000,
        headers: { 'Content-Type': 'application/json' },
        withCredentials: true
      };
      
      if (data) {
        config.data = data;
      }
      
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error('API Error:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login.html';
        return;
      }
      throw error;
    }
  }

  async loadDomains() {
    try {
      this.renderLoading();
      
      const response = await this.api('GET', '/domains');
      
      console.log('Domains API response:', response);
      
      // Handle different response formats
      let domainsArray;
      if (Array.isArray(response)) {
        domainsArray = response;
      } else if (response && Array.isArray(response.domains)) {
        domainsArray = response.domains;
      } else if (response && response.success && Array.isArray(response.domains)) {
        domainsArray = response.domains;
      } else {
        console.error('Unexpected response format:', response);
        throw new Error('Server returned unexpected response format');
      }
      
      this.domains = domainsArray;
      this.applyFiltersAndSort();
      this.renderDomainList();
      this.updateStats();
      
      // If no domain is selected but we have domains, select the first one
      if (!this.selectedDomain && this.domains.length > 0) {
        this.selectDomain(this.domains[0].domain);
      }
    } catch (error) {
      console.error('Error loading domains:', error);
      
      // Handle authentication errors
      if (error.response && error.response.status === 401) {
        console.log('Authentication required, redirecting to login...');
        window.location.href = '/login.html';
        return;
      }
      
      this.safeSetContent('domain-list-container', `
        <div class="text-center py-5">
          <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
          <h5 class="text-danger">Failed to load domains</h5>
          <p class="text-muted">${error.message || 'Unknown error occurred'}</p>
          <button class="btn btn-primary" onclick="sslManager.loadDomains()">
            <i class="fas fa-sync-alt me-1"></i> Retry
          </button>
        </div>
      `);
    }
  }

  async loadAutorenewalData() {
    try {
      const response = await this.api('GET', '/autorenewal/data');
      
      if (response && response.success) {
        this.autorenewalData = response.data;
        this.renderAutorenewalTab();
      }
    } catch (error) {
      console.error('Error loading autorenewal data:', error);
      this.addNotification('error', 'Failed to load autorenewal data', true);
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
    this.currentPage = page;
    this.renderDomainList();
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
    this.addNotification('info', 'Refreshing domain list...', false);
    await this.loadDomains();
    this.addNotification('success', 'Domain list refreshed', true);
  }

  async installSSL(domain, email, method = 'nginx') {
    try {
      this.addNotification('info', `Starting SSL installation for ${domain} using ${method} method...`, false);
      
      const requestData = { domain, email, method };
      const timeout = method === 'dns' ? 180000 : 120000; // DNS method needs more time
      
      const response = await this.api('POST', '/ssl/install', requestData, { timeout });
      
      if (response.success) {
        this.addNotification('success', `SSL installation started for ${domain}`, false);
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
        const responseData = error.response.data;
        if (responseData?.certificate_instructions) {
          this.addNotification('info', `Certificate creation required for ${domain}:`, true);
          responseData.certificate_instructions.forEach(instruction => {
            this.addNotification('info', instruction, true);
          });
        } else {
          this.addNotification('error', `DNS method: ${error.response.data?.message || error.message}`, true);
        }
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

  async refreshSSLData(domain) {
    try {
      this.addNotification('info', `Refreshing SSL certificate data for ${domain}...`, false);
      
      const response = await this.api('POST', `/ssl/refresh/${domain}`);
      
      if (response.success) {
        // Update the domain's SSL data immediately
        const domainIndex = this.domains.findIndex(d => d.domain === domain);
        if (domainIndex !== -1) {
          this.domains[domainIndex].ssl = response.ssl;
          this.renderDomainList();
          if (this.selectedDomain === domain) {
            this.renderSSLPanel();
          }
        }
        
        this.addNotification('success', `SSL certificate data refreshed for ${domain}`, true);
      }
    } catch (error) {
      console.error('Error refreshing SSL data:', error);
      this.addNotification('error', `Failed to refresh SSL data for ${domain}`, true);
    }
  }

  updateStats() {
    const stats = {
      total: this.domains.length,
      withSSL: 0,
      expiring: 0,
      expired: 0
    };

    this.domains.forEach(domain => {
      const ssl = domain.ssl;
      if (ssl && ssl.hasSSL) {
        stats.withSSL++;
        if (ssl.isExpired) {
          stats.expired++;
        } else if (ssl.isExpiringSoon) {
          stats.expiring++;
        }
      }
    });

    this.safeSetText('stat-total', stats.total);
    this.safeSetText('stat-ssl', stats.withSSL);
    this.safeSetText('stat-expiring', stats.expiring);
    this.safeSetText('stat-expired', stats.expired);
  }

  selectDomain(domain) {
    this.selectedDomain = domain;
    this.renderSSLPanel();
    
    // Update active state in domain list
    document.querySelectorAll('#domain-list-container .list-group-item').forEach(item => {
      item.classList.remove('active');
    });
    
    const selectedItem = document.querySelector(`#domain-list-container .list-group-item[data-domain="${domain}"]`);
    if (selectedItem) {
      selectedItem.classList.add('active');
    }
  }

  addNotification(type, message, persistent = false) {
    const id = ++this.notificationCounter;
    const notification = { id, type, message, persistent, timestamp: Date.now() };
    this.notifications.unshift(notification);
    
    // Keep only recent notifications (last 50)
    if (this.notifications.length > 50) {
      this.notifications = this.notifications.slice(0, 50);
    }
    
    this.renderNotifications();
    
    // Auto-remove non-persistent notifications after 5 seconds
    if (!persistent) {
      setTimeout(() => {
        this.removeNotification(id);
      }, 5000);
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
        statusIcon = 'fas fa-check-circle';
        break;
      case 'disconnected':
        statusClass = 'text-warning';
        statusText = 'Disconnected';
        statusIcon = 'fas fa-exclamation-circle';
        break;
      case 'error':
        statusClass = 'text-danger';
        statusText = 'Connection Error';
        statusIcon = 'fas fa-times-circle';
        break;
      default:
        statusClass = 'text-muted';
        statusText = 'Unknown';
        statusIcon = 'fas fa-question-circle';
    }
    
    statusElement.innerHTML = `
      <i class="${statusIcon} me-1"></i>
      <span class="${statusClass}">${statusText}</span>
    `;
  }

  renderApp() {
    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    appContainer.innerHTML = `
      <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <div class="container-fluid">
          <a class="navbar-brand" href="#">
            <i class="fas fa-shield-alt me-2"></i>
            SSL Certificate Manager
          </a>
          <div class="navbar-nav ms-auto">
            <div class="nav-item">
              <span class="navbar-text me-3" id="connection-status">
                <i class="fas fa-circle text-muted"></i> Connecting...
              </span>
              <span class="navbar-text me-3">
                Welcome, ${this.currentUser || 'User'}
              </span>
              <button class="btn btn-outline-light btn-sm" onclick="sslManager.logout()">
                <i class="fas fa-sign-out-alt me-1"></i> Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      
      <div class="container-fluid mt-4">
        <!-- Notifications -->
        <div id="notifications-container" class="mb-4"></div>
        
        <!-- Tab Navigation -->
        <ul class="nav nav-tabs mb-4" id="main-tabs">
          <li class="nav-item">
            <a class="nav-link ${this.activeTab === 'domains' ? 'active' : ''}" 
               onclick="sslManager.switchTab('domains')" href="#" id="domains-tab">
              <i class="fas fa-globe me-2"></i>Domain Management
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link ${this.activeTab === 'autorenewal' ? 'active' : ''}" 
               onclick="sslManager.switchTab('autorenewal')" href="#" id="autorenewal-tab">
              <i class="fas fa-sync me-2"></i>Auto Renewal
            </a>
          </li>
        </ul>
        
        <!-- Tab Content -->
        <div id="tab-content"></div>
      </div>
    `;
  }

  renderDashboard() {
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
                      <i class="fas fa-shield-alt fa-2x opacity-75"></i>
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

        <div class="col-lg-8">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h5 class="mb-0">Domain Management</h5>
              <div>
                <button class="btn btn-success btn-sm me-2" onclick="sslManager.toggleAddDomainForm()">
                  <i class="fas fa-plus me-1"></i> Add Domain
                </button>
                <button class="btn btn-primary btn-sm me-2" onclick="sslManager.refreshDomains()">
                  <i class="fas fa-sync-alt me-1"></i> Refresh
                </button>
                <button class="btn btn-warning btn-sm" onclick="sslManager.renewAllSSL()">
                  <i class="fas fa-certificate me-1"></i> Renew All SSL
                </button>
              </div>
            </div>
            <div class="card-body">
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
                    <option value="expiry-asc">Expiry (Earliest)</option>
                    <option value="expiry-desc">Expiry (Latest)</option>
                    <option value="status-asc">Status</option>
                  </select>
                </div>
              </div>

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

              <div id="domain-list-container"></div>
              <div id="pagination-container" class="mt-3"></div>
            </div>
          </div>
        </div>

        <div class="col-lg-4">
          <div id="ssl-panel-container"></div>
        </div>
      </div>
    `;
  }

  formatExpiryDate(ssl) {
    if (!ssl || !ssl.hasSSL || !ssl.expiryDate) {
      return '-';
    }

    try {
      const expiryDate = new Date(ssl.expiryDate);
      const now = new Date();
      const timeDiff = expiryDate.getTime() - now.getTime();
      const daysUntilExpiry = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      
      const formattedDate = expiryDate.toLocaleDateString();
      
      if (daysUntilExpiry < 0) {
        return `${formattedDate} (Expired ${Math.abs(daysUntilExpiry)} days ago)`;
      } else if (daysUntilExpiry === 0) {
        return `${formattedDate} (Expires today)`;
      } else {
        return `${formattedDate} (${daysUntilExpiry} days remaining)`;
      }
    } catch (error) {
      console.error('Error formatting expiry date:', error);
      return 'Invalid date';
    }
  }

  getDaysUntilExpiry(ssl) {
    if (!ssl || !ssl.hasSSL || !ssl.expiryDate) {
      return null;
    }

    try {
      const expiryDate = new Date(ssl.expiryDate);
      const now = new Date();
      const timeDiff = expiryDate.getTime() - now.getTime();
      return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    } catch (error) {
      console.error('Error calculating days until expiry:', error);
      return null;
    }
  }

  renderDomainList() {
    this.applyFiltersAndSort();
    
    const container = document.getElementById('domain-list-container');
    if (!container) return;

    const currentPageDomains = this.getCurrentPageDomains();

    if (currentPageDomains.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5">
          <i class="fas fa-search fa-3x text-muted mb-3"></i>
          <h5 class="text-muted">No domains found</h5>
          <p class="text-muted">Try adjusting your search or filter criteria.</p>
        </div>
      `;
      return;
    }

    const domainListHTML = currentPageDomains.map(domain => {
      const ssl = domain.ssl;
      const statusBadge = this.getSSLStatusBadge(ssl);
      const expiryDisplay = this.formatExpiryDate(ssl);
      
      return `
        <div class="list-group-item list-group-item-action ${this.selectedDomain === domain.domain ? 'active' : ''}" 
             data-domain="${domain.domain}"
             onclick="sslManager.selectDomain('${domain.domain}')">
          <div class="d-flex w-100 justify-content-between align-items-center">
            <div class="flex-grow-1">
              <h6 class="mb-1">${domain.domain}</h6>
              <small class="text-muted">${ssl?.issuer || 'No SSL Certificate'}</small>
            </div>
            <div class="text-end">
              <div class="mb-1">${statusBadge}</div>
              <small class="text-muted">${expiryDisplay}</small>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="list-group">
        ${domainListHTML}
      </div>
    `;

    this.renderPagination();
  }

  renderPagination() {
    const container = document.getElementById('pagination-container');
    if (!container) return;

    const totalPages = Math.ceil(this.filteredDomains.length / this.itemsPerPage);
    
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let paginationHTML = `
      <nav aria-label="Domain pagination">
        <ul class="pagination pagination-sm justify-content-center">
    `;

    // Previous button
    if (this.currentPage > 1) {
      paginationHTML += `
        <li class="page-item">
          <a class="page-link" href="#" onclick="sslManager.setPage(${this.currentPage - 1}); return false;">
            <i class="fas fa-chevron-left"></i>
          </a>
        </li>
      `;
    }

    // Page numbers
    const startPage = Math.max(1, this.currentPage - 2);
    const endPage = Math.min(totalPages, this.currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
      paginationHTML += `
        <li class="page-item ${i === this.currentPage ? 'active' : ''}">
          <a class="page-link" href="#" onclick="sslManager.setPage(${i}); return false;">${i}</a>
        </li>
      `;
    }

    // Next button
    if (this.currentPage < totalPages) {
      paginationHTML += `
        <li class="page-item">
          <a class="page-link" href="#" onclick="sslManager.setPage(${this.currentPage + 1}); return false;">
            <i class="fas fa-chevron-right"></i>
          </a>
        </li>
      `;
    }

    paginationHTML += `
        </ul>
      </nav>
    `;

    container.innerHTML = paginationHTML;
  }

  renderSSLPanel() {
    const container = document.getElementById('ssl-panel-container');
    if (!container) return;

    if (!this.selectedDomain) {
      container.innerHTML = `
        <div class="card">
          <div class="card-body text-center py-5">
            <i class="fas fa-hand-pointer fa-3x text-muted mb-3"></i>
            <h5 class="text-muted">Select a domain</h5>
            <p class="text-muted">Choose a domain from the list to view SSL certificate details.</p>
          </div>
        </div>
      `;
      return;
    }

    const domain = this.domains.find(d => d.domain === this.selectedDomain);
    if (!domain) return;

    const ssl = domain.ssl;
    const statusBadge = this.getSSLStatusBadge(ssl);
    const expiryDisplay = this.formatExpiryDate(ssl);

    container.innerHTML = `
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h6 class="mb-0">${domain.domain}</h6>
          ${statusBadge}
        </div>
        <div class="card-body">
          <h6 class="card-title">SSL Certificate Details</h6>
          
          ${ssl && ssl.hasSSL ? `
            <div class="row g-2 mb-3">
              <div class="col-4 text-muted">Status:</div>
              <div class="col-8">${statusBadge}</div>
            </div>
            <div class="row g-2 mb-3">
              <div class="col-4 text-muted">Expires:</div>
              <div class="col-8">${expiryDisplay}</div>
            </div>
            <div class="row g-2 mb-3">
              <div class="col-4 text-muted">Issued by:</div>
              <div class="col-8">${ssl.issuerOrg || ssl.issuer || 'Unknown'}</div>
            </div>
            <div class="row g-2 mb-3">
              <div class="col-4 text-muted">Subject:</div>
              <div class="col-8">${ssl.commonName || ssl.subject || domain.domain}</div>
            </div>
          ` : `
            <div class="alert alert-warning">
              <i class="fas fa-exclamation-triangle me-2"></i>
              No SSL certificate found for this domain.
            </div>
          `}
          
          <h6 class="card-title mt-4">Domain Configuration</h6>
          <div class="row g-2 mb-3">
            <div class="col-4 text-muted">Root:</div>
            <div class="col-8">${domain.documentRoot || '/var/www/html'}</div>
          </div>
          <div class="row g-2 mb-3">
            <div class="col-4 text-muted">Config:</div>
            <div class="col-8">${domain.configFile || 'Not available'}</div>
          </div>
          <div class="row g-2 mb-3">
            <div class="col-4 text-muted">Ports:</div>
            <div class="col-8">${domain.ports ? domain.ports.join(', ') : '80'}</div>
          </div>
          
          <div class="d-grid gap-2 mt-4">
            ${!ssl?.hasSSL ? `
              <button class="btn btn-success" onclick="sslManager.toggleInstallForm('${domain.domain}')">
                <i class="fas fa-plus me-1"></i> Install SSL Certificate
              </button>
            ` : `
              <button class="btn btn-warning" onclick="sslManager.renewSSL('${domain.domain}')">
                <i class="fas fa-sync-alt me-1"></i> Renew Certificate
              </button>
            `}
            <button class="btn btn-info" onclick="sslManager.refreshSSLData('${domain.domain}')">
              <i class="fas fa-refresh me-1"></i> Refresh SSL Data
            </button>
            <button class="btn btn-danger" onclick="sslManager.deleteDomain('${domain.domain}')">
              <i class="fas fa-trash me-1"></i> Delete Domain
            </button>
          </div>
        </div>
      </div>
    `;
  }

  getSSLStatusBadge(ssl) {
    if (!ssl || !ssl.hasSSL) {
      return '<span class="badge bg-secondary">No SSL</span>';
    }
    
    if (ssl.isExpired) {
      return '<span class="badge bg-danger">Expired</span>';
    }
    
    if (ssl.isExpiringSoon) {
      return '<span class="badge bg-warning">Expiring Soon</span>';
    }
    
    return '<span class="badge bg-success">Active</span>';
  }

  renderLoading() {
    const container = document.getElementById('domain-list-container');
    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
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

  renderNotifications() {
    const container = document.getElementById('notifications-container');
    if (!container) return;

    const recentNotifications = this.notifications.slice(0, 5);
    
    if (recentNotifications.length === 0) {
      container.innerHTML = '';
      return;
    }

    const notificationsHTML = recentNotifications.map(notification => {
      const alertClass = this.getNotificationClass(notification.type);
      const icon = this.getNotificationIcon(notification.type);
      
      return `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
          <i class="${icon} me-2"></i>
          ${notification.message}
          <button type="button" class="btn-close" onclick="sslManager.removeNotification(${notification.id})"></button>
        </div>
      `;
    }).join('');

    container.innerHTML = notificationsHTML;
  }

  getNotificationClass(type) {
    switch (type) {
      case 'success': return 'alert-success';
      case 'error': return 'alert-danger';
      case 'warning': return 'alert-warning';
      case 'info': return 'alert-info';
      default: return 'alert-secondary';
    }
  }

  getNotificationIcon(type) {
    switch (type) {
      case 'success': return 'fas fa-check-circle';
      case 'error': return 'fas fa-exclamation-circle';
      case 'warning': return 'fas fa-exclamation-triangle';
      case 'info': return 'fas fa-info-circle';
      default: return 'fas fa-bell';
    }
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
  }

  toggleAddDomainForm() {
    const form = document.getElementById('add-domain-form');
    if (form) {
      const isVisible = form.style.display !== 'none';
      form.style.display = isVisible ? 'none' : 'block';
      
      if (!isVisible) {
        const input = document.getElementById('new-domain-input');
        if (input) {
          setTimeout(() => input.focus(), 100);
        }
      }
    }
  }

  async addDomainFromForm() {
    const input = document.getElementById('new-domain-input');
    const validationMessage = document.getElementById('domain-validation-message');
    
    if (!input || !validationMessage) return;
    
    const domain = input.value.trim();
    
    if (!domain) {
      this.showValidationMessage('Please enter a domain name', 'error');
      return;
    }
    
    if (!this.validateDomain(domain)) {
      this.showValidationMessage('Please enter a valid domain name (e.g., example.com)', 'error');
      return;
    }
    
    try {
      this.addNotification('info', `Adding domain ${domain}...`, false);
      
      const response = await this.api('POST', '/domains/add', { domain });
      
      if (response.success) {
        input.value = '';
        this.toggleAddDomainForm();
        this.showValidationMessage('', '');
        this.addNotification('success', `Domain ${domain} added successfully`, true);
        this.loadDomains();
      } else {
        this.showValidationMessage(response.message || 'Failed to add domain', 'error');
      }
    } catch (error) {
      console.error('Error adding domain:', error);
      this.showValidationMessage('Failed to add domain', 'error');
    }
  }

  async deleteDomain(domain) {
    if (!confirm(`Are you sure you want to delete ${domain}? This will also remove any SSL certificates.`)) {
      return;
    }
    
    try {
      this.addNotification('info', `Deleting domain ${domain}...`, false);
      
      const response = await this.api('DELETE', `/domains/${domain}`);
      
      if (response.success) {
        this.addNotification('success', `Domain ${domain} deleted successfully`, true);
        
        // Clear selection if deleted domain was selected
        if (this.selectedDomain === domain) {
          this.selectedDomain = null;
        }
        
        this.loadDomains();
      } else {
        this.addNotification('error', response.message || 'Failed to delete domain', true);
      }
    } catch (error) {
      console.error('Error deleting domain:', error);
      this.addNotification('error', 'Failed to delete domain', true);
    }
  }

  validateDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.([a-zA-Z]{2,}|xn--[a-zA-Z0-9]+)$/;
    return domainRegex.test(domain);
  }

  showValidationMessage(message, type) {
    const validationMessage = document.getElementById('domain-validation-message');
    if (!validationMessage) return;
    
    if (!message) {
      validationMessage.innerHTML = '';
      return;
    }
    
    const className = type === 'error' ? 'text-danger' : 'text-success';
    validationMessage.innerHTML = `<span class="${className}">${message}</span>`;
  }

  toggleInstallForm(domain) {
    const existingForm = document.getElementById(`ssl-install-form-${domain}`);
    if (existingForm) {
      existingForm.remove();
      return;
    }

    const container = document.getElementById('ssl-panel-container');
    if (!container) return;

    const formHTML = `
      <div id="ssl-install-form-${domain}" class="card mt-3">
        <div class="card-header">
          <h6 class="mb-0">Install SSL Certificate</h6>
        </div>
        <div class="card-body">
          <form onsubmit="sslManager.installSSLFromForm('${domain}'); return false;">
            <div class="mb-3">
              <label for="ssl-email-${domain}" class="form-label">Email Address</label>
              <input type="email" class="form-control" id="ssl-email-${domain}" 
                     placeholder="your@email.com" required>
              <div class="form-text">Required for Let's Encrypt registration</div>
            </div>
            <div class="mb-3">
              <label for="ssl-method-${domain}" class="form-label">Installation Method</label>
              <select class="form-select" id="ssl-method-${domain}">
                <option value="nginx">Nginx (Recommended)</option>
                <option value="dns">DNS Challenge (CloudNS)</option>
              </select>
              <div class="form-text">
                Nginx method works for most domains. Use DNS for domains behind CloudFlare or with special configurations.
              </div>
            </div>
            <div class="d-grid gap-2">
              <button type="submit" class="btn btn-success">
                <i class="fas fa-certificate me-1"></i> Install SSL Certificate
              </button>
              <button type="button" class="btn btn-secondary" onclick="sslManager.toggleInstallForm('${domain}')">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', formHTML);
    
    const emailInput = document.getElementById(`ssl-email-${domain}`);
    if (emailInput) {
      setTimeout(() => emailInput.focus(), 100);
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
      return;
    }
    
    // Remove the form
    this.toggleInstallForm(domain);
    
    // Start SSL installation
    await this.installSSL(domain, email, method);
  }

  renderAutorenewalTab() {
    const tabContent = document.getElementById('tab-content');
    if (!tabContent) return;

    tabContent.innerHTML = `
      <div class="row">
        <div class="col-12">
          <div class="card">
            <div class="card-header">
              <h5 class="mb-0">SSL Auto-Renewal Management</h5>
            </div>
            <div class="card-body" id="autorenewal-content">
              <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-3 text-muted">Loading auto-renewal data...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

// Initialize the SSL Manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.sslManager = new SSLManager();
});