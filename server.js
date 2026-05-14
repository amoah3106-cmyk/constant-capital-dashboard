
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
const fetch = require('node-fetch');
const path = require('path');
const {
  getCachedResponse,
  setCachedResponse,
  addSearchHistory,
  getSearchHistory,
  clearSearchHistory,
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = process.env.API_BASE_URL || 'https://api.frankfurter.app';
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
const FRANKFURTER_API_KEY = process.env.FRANKFURTER_API_KEY || '';
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS) || 10000;


// Security Middleware: HTTPS Redirect (production)

if (NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

// Security Middleware: Request Size Limits

app.use(express.json({ limit: '1kb' }));
app.use(express.urlencoded({ limit: '1kb', extended: false }));


// Security Middleware: CORS (Restricted)

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  maxAge: 3600
}));


// Security Middleware: Security Headers

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' https://cdn.jsdelivr.net; " +
      "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data:; " +
      "connect-src 'self' https://api.frankfurter.app"
    );
  }
  next();
});


// Security Middleware: Rate Limiting

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // stricter limit for API
  message: 'Too many API requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);
app.use('/api/', apiLimiter);


// Security Middleware: CSRF Protection

app.use(cookieParser());
const csrfProtection = csrf({ cookie: true });

// Middleware to set XSRF-TOKEN cookie for the client
app.use(csrfProtection);
app.use((req, res, next) => {
  res.cookie('XSRF-TOKEN', req.csrfToken(), {
    httpOnly: false, // Accessible to client JS
    secure: NODE_ENV === 'production',
    sameSite: 'Lax'
  });
  next();
});


// Static Files

app.use(express.static(path.join(__dirname, 'public')));
// Middleware: Mock API Key check (demonstrates understanding)

app.use('/api', (req, res, next) => {
  // In production, you would validate X-API-KEY here.
  // For this demo, we accept all requests.
  next();
});


// Validation Helpers



function validateCurrency(code) {
  const upper = String(code).toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(upper)) {
    throw new Error('Invalid currency code format');
  }
  return upper;
}

// Validate days parameter (between 1 and 365)
function validateDays(days) {
  const parsed = parseInt(days) || 30;
  return Math.min(Math.max(parsed, 1), 365);
}


// Sanitize string input (max 100 chars, trim whitespace)

function sanitizeString(str, maxLength = 100) {
  if (typeof str !== 'string') {
    throw new Error('Input must be a string');
  }
  const trimmed = str.trim();
  if (trimmed.length === 0) {
    throw new Error('Input cannot be empty');
  }
  if (trimmed.length > maxLength) {
    throw new Error(`Input exceeds maximum length of ${maxLength}`);
  }
  return trimmed;
}


//Format error response (hides details in production)

function formatError(err, status = 500) {
  const isDev = NODE_ENV === 'development';
  return {
    success: false,
    error: err.message || 'An error occurred',
    ...(isDev && { details: err.stack })
  };
}


// Helper: Fetch from Frankfurter with caching

async function fetchWithCache(cacheKey, url) {
  // Check cache first
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    return { data: cached, fromCache: true };
  }

  // Build headers
  const headers = {
    'Accept': 'application/json'
  };

  // Add API key if available
  if (FRANKFURTER_API_KEY) {
    headers['X-API-KEY'] = FRANKFURTER_API_KEY;
  }

  // Create timeout controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      timeout: TIMEOUT_MS
    });

    if (!response.ok) {
      // Try to parse error message from response
      let errorMsg = `API returned ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) errorMsg = errorData.error;
      } catch (e) {
        // Could not parse error response, use default
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();

    // Store in cache
    setCachedResponse(cacheKey, data);

    return { data, fromCache: false };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout (${TIMEOUT_MS}ms) - external API is slow, using cached data if available`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}


// GET /api/currencies — List all currencies

app.get('/api/currencies', async (req, res) => {
  try {
    const { data, fromCache } = await fetchWithCache(
      'currencies',
      `${API_BASE}/currencies`
    );
    res.json({ success: true, data, fromCache });
  } catch (err) {
    console.error('Error fetching currencies:', err.message);
    res.status(502).json(formatError(err, 502));
  }
});


// GET /api/rates?base=USD — Latest exchange rates

app.get('/api/rates', async (req, res) => {
  try {
    const base = validateCurrency(req.query.base || 'USD');
    const cacheKey = `rates_${base}`;
    const { data, fromCache } = await fetchWithCache(
      cacheKey,
      `${API_BASE}/latest?base=${base}`
    );
    res.json({ success: true, data, fromCache });
  } catch (err) {
    console.error('Error fetching rates:', err.message);
    res.status(502).json(formatError(err, 502));
  }
});


// GET /api/history?from=USD&to=EUR&days=30

app.get('/api/history', async (req, res) => {
  try {
    const from = validateCurrency(req.query.from || 'USD');
    const to = validateCurrency(req.query.to || 'EUR');
    const days = validateDays(req.query.days);

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const cacheKey = `history_${from}_${to}_${startStr}_${endStr}`;
    const { data, fromCache } = await fetchWithCache(
      cacheKey,
      `${API_BASE}/${startStr}..${endStr}?from=${from}&to=${to}`
    );

    res.json({ success: true, data, fromCache });
  } catch (err) {
    console.error('Error fetching history:', err.message);
    res.status(400).json(formatError(err, 400));
  }
});


// GET /api/search-history

app.get('/api/search-history', (req, res) => {
  try {
    const history = getSearchHistory();
    res.json({ success: true, data: history });
  } catch (err) {
    console.error('Error fetching search history:', err.message);
    res.status(500).json(formatError(err, 500));
  }
});

// POST /api/search-history — { query: "euro" }

app.post('/api/search-history', (req, res) => {
  try {
    const { query } = req.body;

    // Validate query input
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query must be a non-empty string'
      });
    }

    const sanitized = sanitizeString(query, 100);
    addSearchHistory(sanitized);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving search:', err.message);
    res.status(400).json(formatError(err, 400));
  }
});


// DELETE /api/search-history

app.delete('/api/search-history', (req, res) => {
  try {
    clearSearchHistory();
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing search history:', err.message);
    res.status(500).json(formatError(err, 500));
  }
});

// GET /api/watchlist
app.get('/api/watchlist', (req, res) => {
  try {
    const watchlist = getWatchlist();
    res.json({ success: true, data: watchlist });
  } catch (err) {
    console.error('Error fetching watchlist:', err.message);
    res.status(500).json(formatError(err, 500));
  }
});


// POST /api/watchlist — { base, target, name }

app.post('/api/watchlist', (req, res) => {
  try {
    const { base, target, name } = req.body;

    // Validate all required fields
    if (!base || !target || !name) {
      return res.status(400).json({
        success: false,
        error: 'base, target, and name are required'
      });
    }

    // Validate and sanitize inputs
    const validatedBase = validateCurrency(base);
    const validatedTarget = validateCurrency(target);
    const sanitizedName = sanitizeString(name, 100);

    const result = addToWatchlist(validatedBase, validatedTarget, sanitizedName);
    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Error adding to watchlist:', err.message);
    res.status(400).json(formatError(err, 400));
  }
});


// DELETE /api/watchlist/:id

app.delete('/api/watchlist/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid watchlist ID'
      });
    }
    removeFromWatchlist(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing from watchlist:', err.message);
    res.status(500).json(formatError(err, 500));
  }
});

// Fallback: Serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error Handling Middleware: 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found'
  });
});

// Error Handling Middleware: Global (last)
app.use((err, req, res, next) => {
  const isDev = NODE_ENV === 'development';
  const statusCode = err.statusCode || err.status || 500;

  console.error(`[${new Date().toISOString()}] Error:`, {
    message: err.message,
    status: statusCode,
    path: req.path,
    method: req.method,
    ...(isDev && { stack: err.stack, body: req.body })
  });

  // Don't expose stack traces in production
  const response = {
    success: false,
    error: isDev ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack })
  };

  res.status(statusCode).json(response);
});

// Start Server with Error Handling
const server = app.listen(PORT, () => {
  console.log(`\n  🏛️  Constant Capital FX Dashboard`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Server running at http://localhost:${PORT}`);
  console.log(`  API proxy:  ${API_BASE}`);
  console.log(`  Database:   ./data/app.db\n`);
});

// Process-Level Error Handlers

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', new Date().toISOString());
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  // Optionally exit after logging
  if (NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', new Date().toISOString());
  console.error('Reason:', reason);
  console.error('Promise:', promise);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[SIGTERM] Received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('\n[SIGINT] Received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
