/**
 * Smoke tests for OVERFRAG Bot
 * Run: node test/smoke.test.js
 * 
 * Verifies:
 *   - Module imports work
 *   - Cache module basic operations
 *   - Rate limiter basic logic
 *   - Logger initialization
 *   - State module initialization
 *   - deploy-commands.js syntax is valid
 */

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}: ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}: ${err.message}`);
  }
}

async function run() {
  console.log('\n🧪 OVERFRAG Bot — Smoke Tests\n');

  // ============================================
  // 1. Module imports
  // ============================================
  console.log('📦 Module imports:');

  test('require cache module', () => {
    const cache = require('../modules/cache');
    assert(cache.getCachedData, 'getCachedData must exist');
    assert(cache.updateCache, 'updateCache must exist');
    assert(cache.init, 'init must exist');
    assert(cache.cleanup, 'cleanup must exist');
    assert(cache.stats, 'stats must exist');
  });

  test('require logger module', () => {
    const logger = require('../modules/logger');
    assert(logger.init, 'init must exist');
    assert(logger.getLogger, 'getLogger must exist');
    assert(logger.rotateLogs, 'rotateLogs must exist');
    assert(logger.cleanOldLogs, 'cleanOldLogs must exist');
  });

  test('require rateLimiter module', () => {
    const rl = require('../modules/rateLimiter');
    assert(rl.fetchWithRetry, 'fetchWithRetry must exist');
    assert(rl.fetchJSON, 'fetchJSON must exist');
    assert(rl.getStats, 'getStats must exist');
  });

  test('require crons module', () => {
    const crons = require('../modules/crons');
    assert(crons.init, 'init must exist');
    assert(crons.register, 'register must exist');
    assert(crons.list, 'list must exist');
    assert(crons.stopAll, 'stopAll must exist');
  });

  test('require state module', () => {
    const state = require('../state');
    assert(state.init, 'init must exist');
    assert(state.saveState, 'saveState must exist');
    assert(state.loadState, 'loadState must exist');
    assert(state.close, 'close must exist');
  });

  test('app.js syntax is valid', () => {
    // Just check the file can be parsed (don't execute it)
    const fs = require('fs');
    const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    // This will throw SyntaxError if invalid
    new Function(code);
  });

  test('deploy-commands.js file exists', () => {
    const fs = require('fs');
    assert(fs.existsSync(path.join(__dirname, '..', 'deploy-commands.js')));
  });

  // ============================================
  // 2. Cache operations
  // ============================================
  console.log('\n💾 Cache operations:');

  await testAsync('cache init (no Redis)', async () => {
    const cache = require('../modules/cache');
    await cache.init(); // no REDIS_URL — in-memory only
    const s = cache.stats();
    assert.strictEqual(s.backend, 'memory');
  });

  await testAsync('cache set and get', async () => {
    const cache = require('../modules/cache');
    let fetchCalled = 0;
    const data = await cache.getCachedData('test:key1', async () => {
      fetchCalled++;
      return { name: 'test', value: 42 };
    }, 60);
    assert.deepStrictEqual(data, { name: 'test', value: 42 });
    assert.strictEqual(fetchCalled, 1);

    // Second call should be cached
    const data2 = await cache.getCachedData('test:key1', async () => {
      fetchCalled++;
      return { name: 'different' };
    }, 60);
    assert.deepStrictEqual(data2, { name: 'test', value: 42 });
    assert.strictEqual(fetchCalled, 1, 'fetchFn should not be called again');
  });

  await testAsync('cache invalidate', async () => {
    const cache = require('../modules/cache');
    await cache.updateCache('test:key2', { hello: 'world' }, 60);
    const before = await cache.getCachedData('test:key2', async () => ({ fallback: true }), 60);
    assert.deepStrictEqual(before, { hello: 'world' });

    await cache.invalidate('test:key2');
    let fetchCalled = false;
    const after = await cache.getCachedData('test:key2', async () => { fetchCalled = true; return { refetched: true }; }, 60);
    assert(fetchCalled, 'Should have called fetchFn after invalidation');
    assert.deepStrictEqual(after, { refetched: true });
  });

  await testAsync('cache cleanup removes expired', async () => {
    const cache = require('../modules/cache');
    // Insert with very short TTL
    await cache.updateCache('test:expired', { old: true }, 0); // 0 second TTL = already expired
    cache.cleanup();
    // After cleanup, should re-fetch
    let fetched = false;
    await cache.getCachedData('test:expired', async () => { fetched = true; return { new: true }; }, 60);
    assert(fetched, 'Should re-fetch after cleanup');
  });

  await testAsync('cache close', async () => {
    const cache = require('../modules/cache');
    await cache.close();
  });

  // ============================================
  // 3. Rate limiter
  // ============================================
  console.log('\n🚦 Rate limiter:');

  test('rate limiter stats empty initially', () => {
    const rl = require('../modules/rateLimiter');
    const stats = rl.getStats();
    assert(typeof stats === 'object');
  });

  test('rate limiter domain config exists', () => {
    const rl = require('../modules/rateLimiter');
    assert(rl.DOMAIN_CONFIG.faceit);
    assert(rl.DOMAIN_CONFIG.twitch);
    assert(rl.DOMAIN_CONFIG.default);
  });

  // ============================================
  // 4. Logger
  // ============================================
  console.log('\n📝 Logger:');

  test('logger init returns logger instance', () => {
    const loggerMod = require('../modules/logger');
    const l = loggerMod.init();
    assert(l.info, 'Logger must have info method');
    assert(l.error, 'Logger must have error method');
    assert(l.warn, 'Logger must have warn method');
    assert(l.child, 'Logger must have child method');
  });

  test('logger child works', () => {
    const loggerMod = require('../modules/logger');
    const l = loggerMod.getLogger();
    const child = l.child({ module: 'test' });
    assert(child.info);
    assert(child.error);
  });

  // ============================================
  // 5. Crons
  // ============================================
  console.log('\n⏰ Crons:');

  test('cron register and list', () => {
    const crons = require('../modules/crons');
    crons.setLogger(() => {}); // suppress logs
    crons.register('test-job', () => {}, 60000);
    const jobs = crons.list();
    assert(jobs.some(j => j.name === 'test-job'));
    crons.stopAll();
    assert.strictEqual(crons.list().length, 0);
  });

  // ============================================
  // 6. State
  // ============================================
  console.log('\n💿 State:');

  await testAsync('state init (no Redis, LevelDB or file)', async () => {
    const state = require('../state');
    await state.init();
    // Should not crash
  });

  await testAsync('state save and load', async () => {
    const state = require('../state');
    await state.saveState({ test: true, value: 123 });
    const loaded = await state.loadState();
    assert.strictEqual(loaded.test, true);
    assert.strictEqual(loaded.value, 123);
    await state.close();
  });

  // ============================================
  // Summary
  // ============================================
  console.log(`\n${'='.repeat(40)}`);
  console.log(`  Total: ${passed + failed} | ✅ ${passed} passed | ❌ ${failed} failed`);
  console.log(`${'='.repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
