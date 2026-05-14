(function () {
  'use strict';

  // ── Global Error Handlers ──
  window.addEventListener('error', (event) => {
    console.error('[Global Error]', event.error);
    if (UI.el.toastContainer) {
      UI.toast(`Error: ${event.error?.message || 'Unknown error'}`, 'error');
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Promise Rejection]', event.reason);
    const message = event.reason?.message || 'An unexpected error occurred';
    if (UI.el.toastContainer) {
      UI.toast(`Error: ${message}`, 'error');
    }
    event.preventDefault();
  });

  // Detect offline status
  window.addEventListener('offline', () => {
    console.warn('[Offline]');
    if (UI.el.toastContainer) {
      UI.toast('You are offline. Some features may be unavailable.', 'error');
    }
  });

  window.addEventListener('online', () => {
    console.log('[Online]');
    if (UI.el.toastContainer) {
      UI.toast('Connection restored.', 'success');
    }
  });

  // ── State ──
  let state = {
    baseCurrency: 'USD',
    currencies: {},
    rates: {},
    watchlist: [],
    searchHistory: [],
    activeChart: null,
    searchDebounce: null
  };

  // ── Init ──
  async function init() {
    UI.init();
    bindEvents();

    // Load initial data — currencies first so names are available for table
    UI.showLoading();
    try {
      const results = await Promise.allSettled([
        loadCurrencies(),
        loadWatchlist(),
        loadSearchHistory()
      ]);

      // Check for partial failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const names = ['currencies', 'watchlist', 'search history'];
          console.error(`Failed to load ${names[index]}:`, result.reason);
        }
      });

      await loadRates();
      UI.hideLoading();
      UI.hideError();
    } catch (err) {
      UI.hideLoading();
      console.error('[Init] Error:', err);
      UI.showError(err.message || 'Failed to load data');
    }
  }

  // ── Data Loaders ──
  async function loadCurrencies() {
    try {
      const result = await API.getCurrencies();
      if (!result.data || typeof result.data !== 'object') {
        throw new Error('Invalid currencies data format');
      }
      state.currencies = result.data;
      UI.populateBaseCurrencyDropdown(state.currencies, state.baseCurrency);
    } catch (err) {
      console.error('[Load Currencies] Error:', err);
      throw err;
    }
  }

  async function loadRates() {
    try {
      const result = await API.getRates(state.baseCurrency);
      if (!result.data || !result.data.rates) {
        throw new Error('Invalid rates data format');
      }
      state.rates = result.data.rates || {};
      UI.setConnectionStatus(result.fromCache);
      UI.updateInfoBar(result.fromCache, result.data.date);
      UI.renderRatesTable(state.rates, state.currencies, state.baseCurrency, state.watchlist);
      UI.hideError();
    } catch (err) {
      console.error('[Load Rates] Error:', err);
      throw err;
    }
  }

  async function loadWatchlist() {
    try {
      const result = await API.getWatchlist();
      state.watchlist = Array.isArray(result.data) ? result.data : [];
      UI.renderWatchlist(state.watchlist);
    } catch (err) {
      console.error('[Load Watchlist] Error:', err);
      state.watchlist = [];
      UI.renderWatchlist([]);
    }
  }

  async function loadSearchHistory() {
    try {
      const result = await API.getSearchHistory();
      state.searchHistory = Array.isArray(result.data) ? result.data : [];
      UI.renderSearchHistory(state.searchHistory);
    } catch (err) {
      console.error('[Load Search History] Error:', err);
      state.searchHistory = [];
      UI.renderSearchHistory([]);
    }
  }

  // ── Event Bindings ──
  function bindEvents() {
    // Base currency change
    UI.el.baseCurrency.addEventListener('change', async (e) => {
      state.baseCurrency = e.target.value;
      UI.showLoading();
      try {
        await loadRates();
        UI.hideLoading();
        UI.toast(`Base currency changed to ${state.baseCurrency}`, 'info');
        // Reload chart if active
        if (state.activeChart) {
          RateChart.load(state.baseCurrency, state.activeChart, RateChart.currentDays);
        }
      } catch (err) {
        UI.hideLoading();
        UI.showError(err.message);
      }
    });

    // Search input with debounce
    UI.el.searchInput.addEventListener('input', (e) => {
      clearTimeout(state.searchDebounce);
      const query = e.target.value.trim();
      UI.filterTable(query);

      // Save search after user stops typing (500ms)
      if (query.length >= 2) {
        state.searchDebounce = setTimeout(async () => {
          try {
            await API.saveSearch(query);
            await loadSearchHistory();
          } catch (err) {
            // Silently fail for search history
          }
        }, 800);
      }
    });

    // Clear search
    UI.el.searchClear.addEventListener('click', () => {
      UI.el.searchInput.value = '';
      UI.filterTable('');
      UI.el.searchInput.focus();
    });
    
    // Clear search history
    UI.el.clearHistory.addEventListener('click', async () => {
      if (confirm('Clear all search history?')) {
        try {
          await API.clearSearchHistory();
          await loadSearchHistory();
          UI.toast('Search history cleared', 'info');
        } catch (err) {
          UI.toast('Failed to clear search history', 'error');
        }
      }
    });

    // Error retry
    UI.el.errorRetry.addEventListener('click', async () => {
      UI.hideError();
      UI.showLoading();
      try {
        await loadRates();
        UI.hideLoading();
      } catch (err) {
        UI.hideLoading();
        UI.showError(err.message);
      }
    });

    // Error dismiss
    UI.el.errorDismiss.addEventListener('click', () => UI.hideError());

    // Table action buttons (event delegation)
    UI.el.ratesBody.addEventListener('click', async (e) => {
      const watchBtn = e.target.closest('.watch-btn');
      const chartBtn = e.target.closest('.chart-btn');

      if (watchBtn) {
        await handleWatchToggle(watchBtn);
      }

      if (chartBtn) {
        handleChartView(chartBtn);
      }
    });

    // Watchlist item clicks (event delegation)
    UI.el.watchlistItems.addEventListener('click', async (e) => {
      const removeBtn = e.target.closest('.item-remove');
      const item = e.target.closest('.sidebar-item');

      if (removeBtn) {
        e.stopPropagation();
        const id = parseInt(removeBtn.dataset.id);
        try {
          await API.removeFromWatchlist(id);
          await loadWatchlist();
          // Refresh table to update star icons
          UI.renderRatesTable(state.rates, state.currencies, state.baseCurrency, state.watchlist);
          UI.toast('Removed from watchlist', 'info');
        } catch (err) {
          UI.toast(err.message, 'error');
        }
        return;
      }

      if (item && item.dataset.target) {
        // Click on watchlist item to show chart
        state.activeChart = item.dataset.target;
        RateChart.load(item.dataset.base, item.dataset.target, RateChart.currentDays);
        // Scroll to chart on mobile
        document.getElementById('chart-container').scrollIntoView({ behavior: 'smooth' });
      }
    });

    // Chart period buttons
    document.querySelectorAll('.chart-period').forEach(btn => {
      btn.addEventListener('click', () => {
        const days = parseInt(btn.dataset.days);
        RateChart.changePeriod(days);
      });
    });

    // Sidebar toggle (mobile)
    UI.el.sidebarToggle.addEventListener('click', () => {
      UI.el.sidebar.classList.toggle('open');
    });
  }

  // ── Watch Toggle Handler ──
  async function handleWatchToggle(btn) {
    const code = btn.dataset.code;
    const name = btn.dataset.name;
    const isWatched = btn.classList.contains('watched');

    try {
      if (isWatched) {
        // Find the watchlist entry and remove
        const entry = state.watchlist.find(w =>
          w.base_currency === state.baseCurrency && w.target_currency === code
        );
        if (entry) {
          await API.removeFromWatchlist(entry.id);
          UI.toast(`${state.baseCurrency}/${code} removed`, 'info');
        }
      } else {
        await API.addToWatchlist(state.baseCurrency, code, name);
        UI.toast(`${state.baseCurrency}/${code} added to watchlist`, 'success');
      }

      await loadWatchlist();
      // Refresh table to update star icons
      UI.renderRatesTable(state.rates, state.currencies, state.baseCurrency, state.watchlist);
      // Reapply search filter if active
      const q = UI.el.searchInput.value.trim();
      if (q) UI.filterTable(q);
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  // ── Chart View Handler ──
  function handleChartView(btn) {
    const code = btn.dataset.code;
    state.activeChart = code;

    // Highlight active chart button
    document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('chart-active'));
    btn.classList.add('chart-active');

    RateChart.load(state.baseCurrency, code, RateChart.currentDays);
    document.getElementById('chart-container').scrollIntoView({ behavior: 'smooth' });
  }

  // ── Start ──
  document.addEventListener('DOMContentLoaded', init);
})();
