/**
 * Cron jobs module — periodic tasks for bot maintenance.
 * Uses simple setInterval-based scheduling (no external cron lib needed).
 * 
 * Tasks:
 *   - Log rotation and cleanup
 *   - Cache cleanup (expired entries)
 *   - Expired music queue cleanup
 *   - State persistence auto-save
 *   - Server stats refresh
 */

const fs = require('fs');
const path = require('path');

const timers = [];
let cronLog = (msg) => console.log(`[cron] ${msg}`);

/**
 * Register a cron job
 * @param {string} name - Job name for logging
 * @param {Function} fn - Async function to run
 * @param {number} intervalMs - Interval in milliseconds
 * @param {boolean} [runImmediately=false] - Run once immediately
 */
function register(name, fn, intervalMs, runImmediately = false) {
  const wrappedFn = async () => {
    try {
      await fn();
    } catch (err) {
      cronLog(`Erro no cron "${name}": ${err.message}`);
    }
  };

  if (runImmediately) {
    wrappedFn();
  }

  const timer = setInterval(wrappedFn, intervalMs);
  timers.push({ name, timer, intervalMs });
  cronLog(`Registado: "${name}" — cada ${formatInterval(intervalMs)}`);
}

/**
 * Initialize all default cron jobs
 * @param {object} deps - Dependencies injected from app.js
 * @param {object} deps.cache - Cache module
 * @param {object} deps.logger - Logger module
 * @param {Function} deps.persistState - Function to persist state
 * @param {Map} deps.musicQueues - Music queue map
 */
function init(deps = {}) {
  const { cache, logger, persistState, musicQueues } = deps;

  // 1. Cache cleanup — every 5 minutes
  if (cache) {
    register('cache-cleanup', () => {
      cache.cleanup();
    }, 5 * 60 * 1000);
  }

  // 2. Log rotation — every hour
  if (logger) {
    register('log-rotation', () => {
      logger.rotateLogs();
    }, 60 * 60 * 1000);

    // 3. Old log cleanup — every 24 hours
    register('log-cleanup', () => {
      logger.cleanOldLogs(30); // 30 days retention
    }, 24 * 60 * 60 * 1000);
  }

  // 4. State auto-save — every 2 minutes
  if (persistState) {
    register('state-autosave', async () => {
      await persistState();
    }, 2 * 60 * 1000);
  }

  // 5. Expired music queue cleanup — every 10 minutes
  if (musicQueues) {
    register('music-queue-cleanup', () => {
      let cleaned = 0;
      for (const [guildId, queue] of musicQueues) {
        // Remove queues with no active player, no connection, and no songs
        if (!queue.player && !queue.connection && queue.songs.length === 0) {
          musicQueues.delete(guildId);
          cleaned++;
        }
      }
      if (cleaned > 0) cronLog(`${cleaned} filas de música vazias removidas`);
    }, 10 * 60 * 1000);
  }

  cronLog(`${timers.length} cron jobs inicializados`);
}

/**
 * Format milliseconds to human-readable interval
 */
function formatInterval(ms) {
  if (ms >= 86400000) return `${Math.round(ms / 86400000)}d`;
  if (ms >= 3600000) return `${Math.round(ms / 3600000)}h`;
  if (ms >= 60000) return `${Math.round(ms / 60000)}min`;
  return `${ms}ms`;
}

/**
 * Get list of active cron jobs
 */
function list() {
  return timers.map(t => ({
    name: t.name,
    interval: formatInterval(t.intervalMs),
  }));
}

/**
 * Stop all cron jobs
 */
function stopAll() {
  for (const t of timers) {
    clearInterval(t.timer);
  }
  cronLog(`${timers.length} cron jobs parados`);
  timers.length = 0;
}

/**
 * Set custom logger function
 */
function setLogger(fn) {
  cronLog = fn;
}

module.exports = {
  init,
  register,
  list,
  stopAll,
  setLogger,
};
