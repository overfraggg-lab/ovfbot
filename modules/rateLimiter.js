/**
 * Rate limiter + exponential backoff for external API calls.
 * Prevents hitting rate limits on Faceit, Twitch, etc.
 * 
 * Usage:
 *   const rateLimiter = require('./modules/rateLimiter');
 *   const data = await rateLimiter.fetchWithRetry('https://api.faceit.com/...', { headers }, { domain: 'faceit' });
 */

const fetch = require('node-fetch');

// Rate limit buckets per domain
const buckets = new Map();

// Default config per domain
const DOMAIN_CONFIG = {
  faceit: {
    maxRequests: 10,    // requests per window
    windowMs: 60000,    // 1 minute window
    maxRetries: 3,
    baseDelayMs: 1000,
  },
  twitch: {
    maxRequests: 30,
    windowMs: 60000,
    maxRetries: 3,
    baseDelayMs: 500,
  },
  soundcloud: {
    maxRequests: 20,
    windowMs: 60000,
    maxRetries: 2,
    baseDelayMs: 1000,
  },
  default: {
    maxRequests: 20,
    windowMs: 60000,
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

function log(msg) { console.log(`[rateLimiter] ${msg}`); }

/**
 * Get or create a rate limit bucket for a domain
 */
function getBucket(domain) {
  if (!buckets.has(domain)) {
    const config = DOMAIN_CONFIG[domain] || DOMAIN_CONFIG.default;
    buckets.set(domain, {
      ...config,
      requests: [],   // timestamps of recent requests
      queue: [],       // pending requests
    });
  }
  return buckets.get(domain);
}

/**
 * Check if we can make a request right now
 */
function canRequest(bucket) {
  const now = Date.now();
  // Clean old requests outside the window
  bucket.requests = bucket.requests.filter(t => t > now - bucket.windowMs);
  return bucket.requests.length < bucket.maxRequests;
}

/**
 * Wait until we can make a request
 */
async function waitForSlot(bucket) {
  while (!canRequest(bucket)) {
    const oldest = bucket.requests[0];
    const waitTime = oldest + bucket.windowMs - Date.now() + 50; // +50ms buffer
    log(`Rate limit atingido, a aguardar ${waitTime}ms...`);
    await sleep(Math.max(waitTime, 100));
    bucket.requests = bucket.requests.filter(t => t > Date.now() - bucket.windowMs);
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with rate limiting and exponential backoff retry.
 * 
 * @param {string} url - URL to fetch
 * @param {object} fetchOptions - Options for node-fetch (headers, method, body, etc.)
 * @param {object} [opts] - Rate limiter options
 * @param {string} [opts.domain='default'] - Domain bucket name
 * @param {number} [opts.maxRetries] - Override max retries
 * @param {number} [opts.timeoutMs=10000] - Request timeout
 * @returns {Response} - fetch Response object
 */
async function fetchWithRetry(url, fetchOptions = {}, opts = {}) {
  const domain = opts.domain || 'default';
  const bucket = getBucket(domain);
  const maxRetries = opts.maxRetries ?? bucket.maxRetries;
  const timeoutMs = opts.timeoutMs ?? 10000;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Wait for rate limit slot
    await waitForSlot(bucket);

    // Record the request
    bucket.requests.push(Date.now());

    try {
      // Add timeout via AbortController (Node 16+)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Handle rate limit responses (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : bucket.baseDelayMs * Math.pow(2, attempt);
        log(`429 Too Many Requests (${domain}), retry em ${waitMs}ms (tentativa ${attempt + 1}/${maxRetries + 1})`);
        await sleep(waitMs);
        continue;
      }

      // Handle server errors (5xx) with retry
      if (response.status >= 500 && attempt < maxRetries) {
        const waitMs = bucket.baseDelayMs * Math.pow(2, attempt);
        log(`${response.status} Server Error (${domain}), retry em ${waitMs}ms (tentativa ${attempt + 1}/${maxRetries + 1})`);
        await sleep(waitMs);
        continue;
      }

      return response;

    } catch (err) {
      lastError = err;

      if (err.name === 'AbortError') {
        log(`Timeout (${timeoutMs}ms) no pedido a ${domain} (tentativa ${attempt + 1}/${maxRetries + 1})`);
      } else {
        log(`Erro no pedido a ${domain}: ${err.message} (tentativa ${attempt + 1}/${maxRetries + 1})`);
      }

      if (attempt < maxRetries) {
        const waitMs = bucket.baseDelayMs * Math.pow(2, attempt);
        await sleep(waitMs);
      }
    }
  }

  throw lastError || new Error(`Falha após ${maxRetries + 1} tentativas para ${domain}`);
}

/**
 * Convenience: fetch JSON with rate limiting
 */
async function fetchJSON(url, fetchOptions = {}, opts = {}) {
  const response = await fetchWithRetry(url, fetchOptions, opts);
  if (!response.ok) return null;
  return response.json();
}

/**
 * Get stats for all rate limit buckets
 */
function getStats() {
  const stats = {};
  const now = Date.now();
  for (const [domain, bucket] of buckets) {
    const active = bucket.requests.filter(t => t > now - bucket.windowMs);
    stats[domain] = {
      activeRequests: active.length,
      maxRequests: bucket.maxRequests,
      windowMs: bucket.windowMs,
      utilization: `${Math.round((active.length / bucket.maxRequests) * 100)}%`,
    };
  }
  return stats;
}

/**
 * Reset a specific bucket
 */
function resetBucket(domain) {
  buckets.delete(domain);
}

module.exports = {
  fetchWithRetry,
  fetchJSON,
  getStats,
  resetBucket,
  DOMAIN_CONFIG,
};
