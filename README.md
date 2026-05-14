# Constant Capital Dashboard

A full-stack currency exchange dashboard that displays live exchange rates, historical charts, and user-personalized watchlists. Built as part of the Constant Capital (Ghana) Limited technical assessment.

## Live Demo

Start the server and open **http://localhost:3000, http://127.0.0.1:3000**


## Features

Feature  Details 

 **Exchange Rates** Displays 29 currency rates from the ECB via [Frankfurter API](https://www.frankfurter.app/)
 **Search & Filter**  Real-time search by currency code or name; search history persisted
 **Historical Charts**  Interactive Chart.js line charts with 7D, 30D, 90D, and 6M views
 **Error Handling**  Graceful error banners, retry buttons, toast notifications, timeout handling
 **SQLite Caching**  API responses cached for 1 hour to reduce external calls
 **Search History**  Last 10 searches stored in SQLite, displayed in sidebar
 **Watchlist** Star up to 10 currency pairs; persisted in SQLite 
 **Base Currency** Switch base currency via dropdown (all 29 supported) 



## Tech Stack

Backend  Node.js + Express 
Database  SQLite via `better-sqlite3` 
Frontend  Vanilla HTML/CSS/JS 
Charts  Chart.js (CDN) 
API  [Frankfurter API](https://www.frankfurter.app/) 

## Setup Instructions

### Prerequisites
- Node.js >= 18.0.0
- npm

### Installation

```bash
# 1. Clone or navigate to the project
cd constant-capital-app

# 2. Install dependencies
npm install

# 3. Start the server
npm start     
# or
node server.js
```

The app will be available at **http://localhost:3000**.

### Environment Variables

A `.env` file is included with defaults:

Variable  Default  Description 

 `PORT`  `3000` the default Server port
 `API_BASE_URL`  `https://api.frankfurter.app`  Frankfurter API base URL 
 `CACHE_TTL_MS`  `3600000`  Cache TTL in milliseconds (1 hour) 

---

### Database Schema

**`cached_responses`** — Caches external API responses
- `cache_key` (TEXT, UNIQUE) — URL/query identifier
- `response_data` (TEXT) — JSON string
- `fetched_at` (DATETIME) — Timestamp for TTL check

**`search_history`** — Stores user search queries (max 10)
- `query` (TEXT) — Search text
- `searched_at` (DATETIME) — Timestamp

**`watchlist`** — User's saved currency pairs (max 10)
- `base_currency` / `target_currency` (TEXT) — Currency pair
- `currency_name` (TEXT) — Display name
- UNIQUE constraint on `(base_currency, target_currency)`

### API Endpoints

Method,  Endpoint,  Description  

 `GET`  `/api/currencies`  All available currencies 
 `GET`  `/api/rates?base=USD`  Latest rates for base currency 
 `GET`  `/api/history?from=USD&to=EUR&days=30`  Historical time series 
 `GET`  `/api/search-history`  Recent search queries 
 `POST`  `/api/search-history`  Save a search `{ query }` 
 `GET`  `/api/watchlist`  Saved watchlist pairs 
 `POST`  `/api/watchlist`  Add pair `{ base, target, name }` 
 `DELETE`  `/api/watchlist/:id`  Remove pair by ID 

---

## API Key Note

The assignment specifies an `X-API-KEY` header. But Frankfurter API is a free api and doesn't require any authentication, but i have included a mock API key header in outgoing requests. In a production environment, this middleware would validate incoming API keys against a whitelist or auth service.

## Author

This is a test app and was built for Constant Capital (Ghana) Limited by Prince Amoah.