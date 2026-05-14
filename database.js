/**
 * database.js — SQLite setup and helper functions
 * 
 * Tables:
 *   - cached_responses: API response cache with 1-hour TTL
 *   - search_history:   User search queries (last 10)
 *   - watchlist:        User-defined currency pairs (max 10)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

try {
  db = new Database(path.join(dataDir, 'app.db'));
  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  console.log('[Database] Connected successfully');
} catch (err) {
  console.error('[Database] Connection failed:', err.message);
  throw new Error(`Database initialization failed: ${err.message}`);
}

// Schema Initialization

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cached_responses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key    TEXT UNIQUE NOT NULL,
      response_data TEXT NOT NULL,
      fetched_at   DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      query       TEXT NOT NULL,
      searched_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      base_currency    TEXT NOT NULL,
      target_currency  TEXT NOT NULL,
      currency_name    TEXT NOT NULL,
      added_at         DATETIME DEFAULT (datetime('now')),
      UNIQUE(base_currency, target_currency)
    );
  `);
  console.log('[Database] Schema initialized');
} catch (err) {
  console.error('[Database Schema Error]', err.message);
  throw new Error(`Schema initialization failed: ${err.message}`);
}

// Cache Helpers

const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS) || 3600000; // 1 hour


function getCachedResponse(key) {
  try {
    const row = db.prepare(
      'SELECT response_data, fetched_at FROM cached_responses WHERE cache_key = ?'
    ).get(key);

    if (!row) return null;

    const fetchedAt = new Date(row.fetched_at + 'Z').getTime();
    const now = Date.now();

    if (now - fetchedAt > CACHE_TTL_MS) {
      // Cache expired — remove it
      db.prepare('DELETE FROM cached_responses WHERE cache_key = ?').run(key);
      return null;
    }

    return JSON.parse(row.response_data);
  } catch (err) {
    console.error('[Cache] Get error for key', key, ':', err.message);
    return null;
  }
}


function setCachedResponse(key, data) {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO cached_responses (cache_key, response_data, fetched_at)
      VALUES (?, ?, datetime('now'))
    `).run(key, JSON.stringify(data));
  } catch (err) {
    console.error('[Cache] Set error for key', key, ':', err.message);
    // Don't throw — cache failures shouldn't break the app
  }
}


// Search History Helpers


function addSearchHistory(query) {
  try {
    const trimmed = query.trim();
    if (!trimmed) return;

    db.prepare(`
      INSERT INTO search_history (query) VALUES (?)
    `).run(trimmed);

    // Keep only the last 10 entries
    db.prepare(`
      DELETE FROM search_history WHERE id NOT IN (
        SELECT id FROM search_history ORDER BY searched_at DESC LIMIT 10
      )
    `).run();
  } catch (err) {
    console.error('[Search History] Error saving:', err.message);
  }
}


function getSearchHistory() {
  try {
    return db.prepare(
      'SELECT id, query, searched_at FROM search_history ORDER BY searched_at DESC LIMIT 10'
    ).all() || [];
  } catch (err) {
    console.error('[Search History] Error fetching:', err.message);
    return [];
  }
}


function clearSearchHistory() {
  try {
    db.prepare('DELETE FROM search_history').run();
  } catch (err) {
    console.error('[Search History] Error clearing:', err.message);
    throw err;
  }
}


// Watchlist Helpers


function addToWatchlist(base, target, name) {
  try {
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM watchlist').get();
    const count = countRow?.cnt || 0;

    if (count >= 10) {
      return { success: false, error: 'Watchlist is full (max 10 pairs)' };
    }

    db.prepare(`
      INSERT INTO watchlist (base_currency, target_currency, currency_name)
      VALUES (?, ?, ?)
    `).run(base, target, name);

    return { success: true };
  } catch (err) {
    console.error('[Watchlist] Add error:', err.message);
    if (err.message.includes('UNIQUE constraint')) {
      return { success: false, error: 'Pair already in watchlist' };
    }
    throw err;
  }
}


function removeFromWatchlist(id) {
  try {
    const result = db.prepare('DELETE FROM watchlist WHERE id = ?').run(id);
    return { success: result.changes > 0 };
  } catch (err) {
    console.error('[Watchlist] Remove error:', err.message);
    throw err;
  }
}


function getWatchlist() {
  try {
    return db.prepare('SELECT * FROM watchlist ORDER BY id DESC').all() || [];
  } catch (err) {
    console.error('[Watchlist] Error fetching:', err.message);
    return [];
  }
}


module.exports = {
  getCachedResponse,
  setCachedResponse,
  addSearchHistory,
  getSearchHistory,
  clearSearchHistory,
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist
};

function addToWatchlist(base, target, name) {
  try {
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM watchlist').get();
    const count = countRow?.cnt || 0;

    if (count >= 10) {
      return { success: false, error: 'Watchlist is full (max 10 pairs)' };
    }

    db.prepare(`
      INSERT INTO watchlist (base_currency, target_currency, currency_name)
      VALUES (?, ?, ?)
    `).run(base, target, name);

    return { success: true };
  } catch (err) {
    console.error('[Watchlist] Add error:', err.message);
    if (err.message.includes('UNIQUE constraint')) {
      return { success: false, error: 'Pair already in watchlist' };
    }
    return { success: false, error: 'Failed to add to watchlist' };
  }
}


// Remove a currency pair from the watchlist.

function removeFromWatchlist(id) {
  try {
    db.prepare('DELETE FROM watchlist WHERE id = ?').run(id);
  } catch (err) {
    console.error('[Watchlist] Remove error:', err.message);
  }
}


//Get all watchlist entries.

function getWatchlist() {
  try {
    return db.prepare(
      'SELECT id, base_currency, target_currency, currency_name, added_at FROM watchlist ORDER BY added_at DESC'
    ).all() || [];
  } catch (err) {
    console.error('[Watchlist] Fetch error:', err.message);
    return [];
  }
}


// Check if a pair exists in the watchlist.

function isInWatchlist(base, target) {
  try {
    const row = db.prepare(
      'SELECT id FROM watchlist WHERE base_currency = ? AND target_currency = ?'
    ).get(base, target);
    return !!row;
  } catch (err) {
    console.error('[Watchlist] Check error:', err.message);
    return false;
  }
}

module.exports = {
  db,
  getCachedResponse,
  setCachedResponse,
  addSearchHistory,
  getSearchHistory,
  clearSearchHistory,
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  isInWatchlist
};
