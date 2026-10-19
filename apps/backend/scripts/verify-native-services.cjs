'use strict';

const assert = require('node:assert/strict');
const { Pool } = require('pg');
const Redis = require('ioredis');

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const name = decodeURIComponent(url.pathname.slice(1));
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !/^[a-zA-Z0-9_]*_test(?:_[a-zA-Z0-9]+)*$/.test(name) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    throw new Error(
      'Use a loopback PostgreSQL URL with a database named onecall_test or ending in _test',
    );
  }
  const redisUrl = new URL(process.env.REDIS_TEST_URL ?? '');
  if (
    !['redis:', 'rediss:'].includes(redisUrl.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(redisUrl.hostname)
  ) {
    throw new Error('Use a loopback disposable Redis URL');
  }
  const pool = new Pool({
    connectionString: url.href,
    max: 2,
    connectionTimeoutMillis: 3000,
  });
  const redis = new Redis(redisUrl.href, {
    lazyConnect: true,
    connectTimeout: 2000,
    commandTimeout: 2000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  let first, second;
  try {
    first = await pool.connect();
    second = await pool.connect();
    const a = (
      await first.query('SELECT version() AS version, pg_backend_pid() AS pid')
    ).rows[0];
    const b = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0];
    assert.match(a.version, /^PostgreSQL /);
    assert.doesNotMatch(a.version, /pglite|wasm|emscripten/i);
    assert.notEqual(
      a.pid,
      b.pid,
      'Native verification requires two independent PostgreSQL backends',
    );
    await redis.connect();
    assert.equal(await redis.ping(), 'PONG');
    console.log(
      'Native PostgreSQL accepts independent connections; disposable Redis is reachable.',
    );
  } finally {
    first?.release();
    second?.release();
    redis.disconnect();
    await pool.end();
  }
}
main().catch(() => {
  // Connection errors can contain credentials. Keep this diagnostic intentionally generic.
  console.error(
    'Native service preflight failed. Check loopback test URLs, the _test database and running PostgreSQL/Redis services.',
  );
  process.exitCode = 1;
});
