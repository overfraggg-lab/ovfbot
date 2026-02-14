const path = require('path');
const fs = require('fs');

const LEVEL_PATH = path.join(__dirname, 'data', 'state_db');
let redis = null;
let db = null;
let usingRedis = false;
let backend = 'file'; // 'redis' | 'leveldb' | 'file'

function log(msg) { console.log(`[state] ${msg}`); }
function logError(msg, err) { console.error(`[state] ERROR ${msg}`, err); }

async function init(redisUrl) {
  const url = redisUrl || process.env.REDIS_URL;

  // Only attempt Redis if a URL is explicitly provided
  if (url) {
    try {
      const Redis = require('ioredis');
      redis = new Redis(url, {
        maxRetriesPerRequest: 2,
        retryStrategy(times) {
          if (times > 3) return null; // stop retrying after 3 attempts
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      redis.on('error', () => {}); // suppress unhandled error events
      await redis.connect();
      await redis.ping();
      usingRedis = true;
      backend = 'redis';
      log('Redis conectado para persistência');
      return;
    } catch (e) {
      log('Redis não disponível: ' + (e.message || e));
      if (redis) { try { redis.disconnect(); } catch (_) {} }
      redis = null;
      usingRedis = false;
    }
  }

  // Try LevelDB (classic-level works with CommonJS)
  try {
    const { ClassicLevel } = require('classic-level');
    fs.mkdirSync(path.dirname(LEVEL_PATH), { recursive: true });
    db = new ClassicLevel(LEVEL_PATH, { valueEncoding: 'utf8' });
    await db.open();
    backend = 'leveldb';
    log('LevelDB inicializado para persistência');
    return;
  } catch (err) {
    logError('LevelDB não disponível: ' + (err.message || err));
    db = null;
  }

  // Fallback to file
  backend = 'file';
  log('A usar ficheiro JSON como fallback para persistência');
}

async function saveState(state) {
  const payload = JSON.stringify(state || {});
  try {
    if (backend === 'redis' && redis) {
      await redis.set('overfrag:state', payload);
    } else if (backend === 'leveldb' && db) {
      await db.put('state', payload);
    } else {
      // fallback file write
      const p = path.join(__dirname, 'data', 'state.json');
      fs.mkdirSync(path.dirname(p), { recursive: true });
      await fs.promises.writeFile(p, payload, 'utf8');
    }
    return true;
  } catch (err) {
    logError('Falha ao guardar estado', err);
    return false;
  }
}

async function loadState() {
  try {
    let payload = null;
    if (backend === 'redis' && redis) {
      payload = await redis.get('overfrag:state');
    } else if (backend === 'leveldb' && db) {
      try {
        payload = await db.get('state');
      } catch (e) {
        // not found
        payload = null;
      }
    } else {
      const p = path.join(__dirname, 'data', 'state.json');
      if (fs.existsSync(p)) payload = await fs.promises.readFile(p, 'utf8');
    }

    if (!payload) return {};
    return JSON.parse(payload);
  } catch (err) {
    logError('Falha ao carregar estado', err);
    return {};
  }
}

async function close() {
  try {
    if (redis) await redis.quit();
    if (db && db.close) await db.close();
  } catch (e) {
    // ignore
  }
}

module.exports = { init, saveState, loadState, close };
