/**
 * Async logger with pino — rotation, buffering, and structured logging.
 * Falls back to console if pino is unavailable.
 * 
 * Usage:
 *   const logger = require('./modules/logger');
 *   logger.info('Bot started');
 *   logger.error({ err }, 'Something failed');
 *   logger.child({ module: 'music' }).info('Playing song');
 */

const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bot.log');
const MAX_LOG_FILES = 7;       // keep 7 rotated files
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB per file

let pinoLogger = null;
let fallbackMode = false;

/**
 * Initialize logger
 */
function init() {
  // Ensure log directory exists
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}

  try {
    const pino = require('pino');

    // Create pino destination with async buffering
    const dest = pino.destination({
      dest: LOG_FILE,
      sync: false,    // async writes
      mkdir: true,
      minLength: 4096 // buffer 4KB before flushing
    });

    pinoLogger = pino({
      level: process.env.LOG_LEVEL || 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) { return { level: label }; },
      },
      base: { service: 'overfrag-bot' },
    }, pino.multistream([
      // Console output (pretty in dev)
      { stream: process.stdout, level: process.env.LOG_LEVEL || 'info' },
      // File output (JSON, async)
      { stream: dest, level: 'debug' },
    ]));

    // Flush on shutdown
    process.on('beforeExit', () => { dest.flushSync(); });

    return pinoLogger;
  } catch (e) {
    fallbackMode = true;
    console.warn('[logger] pino não disponível, usando console como fallback:', e.message);
    return createFallbackLogger();
  }
}

/**
 * Create a fallback logger that uses console
 */
function createFallbackLogger() {
  const timestamp = () => new Date().toISOString();
  const writeToFile = (level, msg, extra) => {
    try {
      const line = `[${timestamp()}] ${level.toUpperCase()}: ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}\n`;
      fs.appendFileSync(LOG_FILE, line);
    } catch (_) {}
  };

  const logger = {
    info(msgOrObj, msg) {
      const [message, extra] = typeof msgOrObj === 'string' ? [msgOrObj, undefined] : [msg, msgOrObj];
      console.log(`[${timestamp()}] ${message}`);
      writeToFile('info', message, extra);
    },
    warn(msgOrObj, msg) {
      const [message, extra] = typeof msgOrObj === 'string' ? [msgOrObj, undefined] : [msg, msgOrObj];
      console.warn(`[${timestamp()}] WARN: ${message}`);
      writeToFile('warn', message, extra);
    },
    error(msgOrObj, msg) {
      const [message, extra] = typeof msgOrObj === 'string' ? [msgOrObj, undefined] : [msg, msgOrObj];
      console.error(`[${timestamp()}] ERROR: ${message}`);
      writeToFile('error', message, extra);
    },
    debug(msgOrObj, msg) {
      const [message, extra] = typeof msgOrObj === 'string' ? [msgOrObj, undefined] : [msg, msgOrObj];
      writeToFile('debug', message, extra);
    },
    fatal(msgOrObj, msg) {
      const [message, extra] = typeof msgOrObj === 'string' ? [msgOrObj, undefined] : [msg, msgOrObj];
      console.error(`[${timestamp()}] FATAL: ${message}`);
      writeToFile('fatal', message, extra);
    },
    child(bindings) {
      // Return a simple child that prefixes messages
      const prefix = Object.values(bindings).join(':');
      const child = {};
      for (const lvl of ['info', 'warn', 'error', 'debug', 'fatal']) {
        child[lvl] = (msgOrObj, msg) => {
          if (typeof msgOrObj === 'string') {
            logger[lvl](`[${prefix}] ${msgOrObj}`);
          } else {
            logger[lvl](msgOrObj, `[${prefix}] ${msg}`);
          }
        };
      }
      child.child = (b) => logger.child({ ...bindings, ...b });
      return child;
    },
    flush() {},
  };
  return logger;
}

/**
 * Rotate log files: bot.log → bot.1.log → bot.2.log → ... 
 * Called by cron module.
 */
function rotateLogs() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const stat = fs.statSync(LOG_FILE);
    if (stat.size < MAX_LOG_SIZE) return; // not big enough to rotate

    // Shift existing rotated files
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const from = path.join(LOG_DIR, `bot.${i}.log`);
      const to = path.join(LOG_DIR, `bot.${i + 1}.log`);
      if (fs.existsSync(from)) {
        if (i + 1 >= MAX_LOG_FILES) {
          fs.unlinkSync(from); // delete oldest
        } else {
          fs.renameSync(from, to);
        }
      }
    }

    // Current → .1
    fs.renameSync(LOG_FILE, path.join(LOG_DIR, 'bot.1.log'));

    // Touch new empty file
    fs.writeFileSync(LOG_FILE, '');

    return true;
  } catch (e) {
    console.error('[logger] Erro na rotação de logs:', e.message);
    return false;
  }
}

/**
 * Clean up old log files beyond retention
 */
function cleanOldLogs(maxAgeDays = 30) {
  try {
    const now = Date.now();
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LOG_DIR);
    let cleaned = 0;
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      const fp = path.join(LOG_DIR, file);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(fp);
        cleaned++;
      }
    }
    if (cleaned > 0) console.log(`[logger] ${cleaned} log files antigos removidos`);
  } catch (e) {
    console.error('[logger] Erro ao limpar logs:', e.message);
  }
}

/**
 * Get the logger instance (initializes if needed)
 */
function getLogger() {
  if (!pinoLogger && !fallbackMode) {
    return init();
  }
  return pinoLogger || createFallbackLogger();
}

module.exports = {
  init,
  getLogger,
  rotateLogs,
  cleanOldLogs,
  LOG_DIR,
  LOG_FILE,
};
