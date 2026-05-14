const UI = {
  // Element cache
  el: {},

  init() {
    this.el = {
      ratesBody: document.getElementById('rates-body'),
      ratesCount: document.getElementById('rates-count'),
      lastUpdated: document.getElementById('last-updated'),
      cacheStatus: document.getElementById('cache-status'),
      searchInput: document.getElementById('search-input'),
      searchClear: document.getElementById('search-clear'),
      loadingSkeleton: document.getElementById('loading-skeleton'),
      tableContainer: document.getElementById('table-container'),
      noResults: document.getElementById('no-results'),
      errorBanner: document.getElementById('error-banner'),
      errorMessage: document.getElementById('error-message'),
      errorRetry: document.getElementById('error-retry'),
      errorDismiss: document.getElementById('error-dismiss'),
      baseCurrency: document.getElementById('base-currency'),
      connectionStatus: document.getElementById('connection-status'),
      watchlistItems: document.getElementById('watchlist-items'),
      watchlistCount: document.getElementById('watchlist-count'),
      watchlistEmpty: document.getElementById('watchlist-empty'),
      historyItems: document.getElementById('history-items'),
      historyEmpty: document.getElementById('history-empty'),
      chartTitle: document.getElementById('chart-title'),
      chartSubtitle: document.getElementById('chart-subtitle'),
      chartPlaceholder: document.getElementById('chart-placeholder'),
      chartLoading: document.getElementById('chart-loading'),
      toastContainer: document.getElementById('toast-container'),
      sidebar: document.getElementById('sidebar'),
      sidebarToggle: document.getElementById('sidebar-toggle'),
      clearHistory: document.getElementById('clear-history'),
    };
  },

  // ── Loading State ──
  showLoading() {
    this.el.loadingSkeleton.classList.remove('hidden');
    this.el.tableContainer.classList.add('hidden');
  },

  hideLoading() {
    this.el.loadingSkeleton.classList.add('hidden');
    this.el.tableContainer.classList.remove('hidden');
  },

  // ── Error Banner ──
  showError(message) {
    this.el.errorMessage.textContent = message;
    this.el.errorBanner.classList.remove('hidden');
    this.el.connectionStatus.className = 'connection-status offline';
    this.el.connectionStatus.querySelector('.status-text').textContent = 'Offline';
  },

  hideError() {
    this.el.errorBanner.classList.add('hidden');
  },

  // ── Connection Status ──
  setConnectionStatus(fromCache) {
    const status = this.el.connectionStatus;
    const text = status.querySelector('.status-text');
    if (fromCache) {
      status.className = 'connection-status cached';
      text.textContent = 'Cached';
    } else {
      status.className = 'connection-status';
      text.textContent = 'Live';
    }
  },

  // ── Rates Table ──
  renderRatesTable(rates, currencies, baseCurrency, watchlist) {
    const tbody = this.el.ratesBody;
    tbody.innerHTML = '';

    const entries = Object.entries(rates);
    let visibleCount = 0;

    entries.forEach(([code, rate], index) => {
      const name = currencies[code] || code;
      const isWatched = watchlist.some(w => w.base_currency === baseCurrency && w.target_currency === code);

      const tr = document.createElement('tr');
      tr.className = 'fade-in';
      tr.style.animationDelay = `${index * 0.03}s`;
      tr.dataset.code = code;
      tr.dataset.name = name;

      tr.innerHTML = `
        <td><span class="currency-code">${code}</span></td>
        <td><span class="currency-name">${name}</span></td>
        <td><span class="currency-rate">${rate.toFixed(4)}</span></td>
        <td>
          <div class="rate-actions">
            <button class="action-btn watch-btn ${isWatched ? 'watched' : ''}"
                    data-code="${code}" data-name="${name}"
                    title="${isWatched ? 'Remove from watchlist' : 'Add to watchlist'}">
              ${isWatched ? '★' : '☆'}
            </button>
            <button class="action-btn chart-btn" data-code="${code}" data-name="${name}" title="View chart">
              📊
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
      visibleCount++;
    });

    this.el.ratesCount.textContent = `${visibleCount} currencies`;
  },

  // ── Filter Table ──
  filterTable(query) {
    const rows = this.el.ratesBody.querySelectorAll('tr');
    let visible = 0;
    const q = query.toLowerCase();

    rows.forEach(row => {
      const code = (row.dataset.code || '').toLowerCase();
      const name = (row.dataset.name || '').toLowerCase();
      const match = !q || code.includes(q) || name.includes(q);
      row.style.display = match ? '' : 'none';
      if (match) visible++;
    });

    this.el.noResults.classList.toggle('hidden', visible > 0);
    this.el.ratesCount.textContent = `${visible} currencies`;

    // Show/hide clear button
    this.el.searchClear.classList.toggle('hidden', !query);
  },

  // ── Update Info Bar ──
  updateInfoBar(fromCache, date) {
    const dateStr = date ? new Date(date).toLocaleString() : new Date().toLocaleString();
    this.el.lastUpdated.textContent = `Updated: ${dateStr}`;

    const badge = this.el.cacheStatus;
    if (fromCache) {
      badge.textContent = 'Cached';
      badge.className = 'cache-badge cached';
    } else {
      badge.textContent = 'Live';
      badge.className = 'cache-badge live';
    }
  },

  // ── Populate Base Currency Dropdown ──
  populateBaseCurrencyDropdown(currencies, selected) {
    const select = this.el.baseCurrency;
    select.innerHTML = '';
    Object.keys(currencies).sort().forEach(code => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${code}`;
      if (code === selected) opt.selected = true;
      select.appendChild(opt);
    });
  },

  // ── Watchlist Sidebar ──
  renderWatchlist(watchlist) {
    const container = this.el.watchlistItems;
    container.innerHTML = '';
    this.el.watchlistCount.textContent = watchlist.length;

    if (watchlist.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No currencies watched</p><span>Click ☆ to add</span></div>';
      return;
    }

    watchlist.forEach(item => {
      const div = document.createElement('div');
      div.className = 'sidebar-item';
      div.dataset.base = item.base_currency;
      div.dataset.target = item.target_currency;

      // Create content safely to prevent XSS
      const labelDiv = document.createElement('div');
      labelDiv.className = 'item-label';
      labelDiv.textContent = `${item.base_currency}/${item.target_currency}`;

      const subDiv = document.createElement('div');
      subDiv.className = 'item-sub';
      subDiv.textContent = item.currency_name; // Use textContent to prevent XSS

      const btnDiv = document.createElement('div');
      btnDiv.innerHTML = `
        <button class="item-remove" data-id="${item.id}" title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;

      const contentWrapper = document.createElement('div');
      contentWrapper.appendChild(labelDiv);
      contentWrapper.appendChild(subDiv);

      div.appendChild(contentWrapper);
      div.appendChild(btnDiv.firstElementChild);
      container.appendChild(div);
    });
  },

  // ── Search History Sidebar ──
  renderSearchHistory(history) {
    const container = this.el.historyItems;
    container.innerHTML = '';

    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No recent searches</p></div>';
      return;
    }

    history.forEach(item => {
      const div = document.createElement('div');
      div.className = 'sidebar-item';

      // Create content safely to prevent XSS
      const labelDiv = document.createElement('div');
      labelDiv.className = 'item-label';
      labelDiv.textContent = `"${item.query}"`; // Use textContent to prevent XSS

      const subDiv = document.createElement('div');
      subDiv.className = 'item-sub';
      subDiv.textContent = new Date(item.searched_at + 'Z').toLocaleString();

      const contentWrapper = document.createElement('div');
      contentWrapper.appendChild(labelDiv);
      contentWrapper.appendChild(subDiv);

      div.appendChild(contentWrapper);
      div.addEventListener('click', () => {
        this.el.searchInput.value = item.query;
        this.el.searchInput.dispatchEvent(new Event('input'));
      });
      container.appendChild(div);
    });
  },

  // ── Toast Notifications ──
  toast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✓', error: '✕', info: 'ℹ'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span>${message}</span>
    `;

    this.el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
};
