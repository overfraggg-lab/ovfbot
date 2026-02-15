/**
 * Cache module with TTL support
 * In-memory cache with optional Redis backend
 * 
 * Usage:
 *   const cache = require('./modules/cache');
 *   await cache.init(); // optional Redis URL
 *   const data = await cache.getCachedData('faceit:player:mutiris', () => fetchFaceitPlayer('mutiris'), 300);
 */

const state = require('../state');

// In-memory store: { key: { data, expiresAt } }
const memoryCache = new Map();

// Default TTLs (seconds)
const DEFAULT_TTL = 300; // 5 min
const TTL_CONFIG = {
  faceit_player: 600,      // 10 min
  faceit_stats: 600,       // 10 min
  faceit_history: 300,     // 5 min
  faceit_match: 3600,      // 1h (match stats don't change)
  twitch_stream: 120,      // 2 min
  autorole_config: 60,     // 1 min
};

let redis = null;
let useRedis = false;

function log(msg) { console.log(`[cache] ${msg}`); }

/**
 * Initialize cache — tries to reuse Redis from state module if available.
 * Falls back to in-memory only.
 */
async function init(redisUrl) {
  const url = redisUrl || process.env.REDIS_URL;
  if (url) {
    try {
      const Redis = require('ioredis');
      redis = new Redis(url, {
        maxRetriesPerRequest: 2,
        retryStrategy(times) { return times > 3 ? null : Math.min(times * 200, 1000); },
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      redis.on('error', () => {});
      await redis.connect();
      await redis.ping();
      useRedis = true;
      log('Redis conectado para cache');
    } catch (e) {
      log('Redis não disponível para cache, a usar in-memory');
      if (redis) { try { redis.disconnect(); } catch (_) {} }
      redis = null;
      useRedis = false;
    }
  } else {
    log('Sem REDIS_URL — cache in-memory ativo');
  }
}

/**
 * Get cached data with TTL. If cache miss or expired, calls fetchFn and caches result.
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Async function that fetches fresh data
 * @param {number} [ttl] - TTL in seconds, defaults based on key prefix or DEFAULT_TTL
 * @returns {*} Cached or fresh data
 */
async function getCachedData(key, fetchFn, ttl) {
  // Determine TTL
  if (ttl === undefined || ttl === null) {
    const prefix = key.split(':')[0];
    ttl = TTL_CONFIG[prefix] || DEFAULT_TTL;
  }

  // Try memory cache first (always check, even with Redis)
  const memEntry = memoryCache.get(key);
  if (memEntry && memEntry.expiresAt > Date.now()) {
    return memEntry.data;
  }

  // Try Redis if available
  if (useRedis && redis) {
    try {
      const cached = await redis.get(`cache:${key}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Also populate memory cache
        memoryCache.set(key, { data: parsed, expiresAt: Date.now() + (ttl * 1000) });
        return parsed;
      }
    } catch (e) {
      // Redis failure, continue to fetch
    }
  }

  // Cache miss — fetch fresh data
  try {
    const data = await fetchFn();
    if (data !== undefined && data !== null) {
      await updateCache(key, data, ttl);
    }
    return data;
  } catch (err) {
    // If fetch fails but we have stale data, return it
    if (memEntry) {
      log(`Fetch falhou para "${key}", a devolver dados stale`);
      return memEntry.data;
    }
    throw err;
  }
}

/**
 * Update cache with new data
 * @param {string} key
 * @param {*} data
 * @param {number} [ttl] - TTL in seconds
 */
async function updateCache(key, data, ttl) {
  if (ttl === undefined || ttl === null) {
    const prefix = key.split(':')[0];
    ttl = TTL_CONFIG[prefix] || DEFAULT_TTL;
  }

  // Memory cache
  memoryCache.set(key, { data, expiresAt: Date.now() + (ttl * 1000) });

  // Redis cache
  if (useRedis && redis) {
    try {
      await redis.set(`cache:${key}`, JSON.stringify(data), 'EX', ttl);
    } catch (e) {
      // Ignore Redis write failures
    }
  }
}

/**
 * Invalidate a cache key
 */
async function invalidate(key) {
  memoryCache.delete(key);
  if (useRedis && redis) {
    try { await redis.del(`cache:${key}`); } catch (_) {}
  }
}

/**
 * Invalidate all keys matching a prefix
 */
async function invalidatePrefix(prefix) {
  for (const [key] of memoryCache) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
  // Redis wildcard delete is costly, skip for now
}

/**
 * Clear expired entries from memory cache
 */
function cleanup() {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) log(`Limpeza: ${cleaned} entradas expiradas removidas`);
}

/**
 * Get cache stats
 */
function stats() {
  const now = Date.now();
  let active = 0, expired = 0;
  for (const [, entry] of memoryCache) {
    if (entry.expiresAt > now) active++;
    else expired++;
  }
  return { total: memoryCache.size, active, expired, backend: useRedis ? 'redis+memory' : 'memory' };
}

/**
 * Close cache connections
 */
async function close() {
  if (redis) {
    try { await redis.quit(); } catch (_) {}
  }
  memoryCache.clear();
}

module.exports = {
  init,
  getCachedData,
  updateCache,
  invalidate,
  invalidatePrefix,
  cleanup,
  stats,
  close,
  TTL_CONFIG,
};
