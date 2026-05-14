/**
 * api.js — API client module
 * Talks to our Express backend (not directly to Frankfurter)
 */

const API = {
  baseUrl: '',
  timeout: 15000, // 15 seconds

  /**
   * Helper to create a timeout promise
   */
  createTimeout(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms)
    );
  },

  /**
   * Helper to get CSRF token from cookie
   */
  getCsrfToken() {
    const name = 'XSRF-TOKEN=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i].trim();
      if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
    }
    return '';
  },

  /**
   * Generic fetch wrapper with error handling, timeout, and retry logic
   */
  async request(endpoint, options = {}) {
    const maxRetries = options.retries || 1;
    let lastError = null;

    // Add CSRF token for state-changing requests
    const method = (options.method || 'GET').toUpperCase();
    const headers = { 
      'Content-Type': 'application/json',
      ...options.headers 
    };

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const token = this.getCsrfToken();
      if (token) {
        headers['X-CSRF-Token'] = token;
      }
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = `${this.baseUrl}${endpoint}`;
        const controller = new AbortController();
        
        const fetchPromise = fetch(url, {
          headers,
          signal: controller.signal,
          ...options
        });

        const res = await Promise.race([
          fetchPromise,
          this.createTimeout(this.timeout)
        ]);

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `Request failed (${res.status})`);
        }

        if (data.success === false) {
          throw new Error(data.error || 'Request failed');
        }

        return data;
      } catch (err) {
        lastError = err;

        // Network errors
        if (err.name === 'TypeError') {
          if (err.message.includes('fetch')) {
            throw new Error('Network error — please check your connection');
          }
        }

        // Timeout errors
        if (err.message.includes('timeout')) {
          if (attempt < maxRetries) {
            console.warn(`[API] Timeout on attempt ${attempt}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
            continue;
          }
          throw new Error('Server is taking too long to respond. Please try again.');
        }

        // Abort errors
        if (err.name === 'AbortError') {
          throw new Error('Request was cancelled');
        }

        throw err;
      }
    }

    throw lastError;
  },

  /** Fetch all available currencies */
  async getCurrencies() {
    return this.request('/api/currencies');
  },

  /** Fetch latest exchange rates for a base currency */
  async getRates(base = 'USD') {
    return this.request(`/api/rates?base=${encodeURIComponent(base)}`);
  },

  /** Fetch historical rates for a currency pair */
  async getHistory(from = 'USD', to = 'EUR', days = 30) {
    return this.request(`/api/history?from=${from}&to=${to}&days=${days}`);
  },

  /** Get search history */
  async getSearchHistory() {
    return this.request('/api/search-history');
  },

  /** Save a search query */
  async saveSearch(query) {
    return this.request('/api/search-history', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
  },

  /** Clear search history */
  async clearSearchHistory() {
    return this.request('/api/search-history', { method: 'DELETE' });
  },

  /** Get watchlist */
  async getWatchlist() {
    return this.request('/api/watchlist');
  },

  /** Add to watchlist */
  async addToWatchlist(base, target, name) {
    return this.request('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ base, target, name })
    });
  },

  /** Remove from watchlist */
  async removeFromWatchlist(id) {
    return this.request(`/api/watchlist/${id}`, { method: 'DELETE' });
  }
};
