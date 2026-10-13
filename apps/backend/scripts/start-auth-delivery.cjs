'use strict';

require('dotenv').config({
  path: process.env.AUTH_DELIVERY_ENV_FILE ?? '.env.delivery',
  quiet: true,
});
const Redis = require('ioredis');
const {
  readConfig,
  createDeliveryApp,
} = require('./auth-delivery/adapter.cjs');

async function main() {
  const config = readConfig();
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    connectTimeout: 2000,
    commandTimeout: 2000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {
    /* Error replies stay generic; credentials are not logged. */
  });
  try {
    await redis.connect();
    await redis.ping();
  } catch {
    redis.disconnect();
    throw new Error('Authentication delivery Redis is unavailable');
  }
  const server = createDeliveryApp({ config, redis }).listen(
    config.port,
    config.host,
  );
  server.headersTimeout = 5_000;
  server.requestTimeout = 8_000;
  server.keepAliveTimeout = 5_000;
  server.on('error', () => {
    redis.disconnect();
    console.error('Authentication delivery listener failed');
    process.exitCode = 1;
  });
  server.once('listening', () =>
    console.log('OneCall authentication delivery listening'),
  );
  let closing = false;
  function shutdown() {
    if (closing) return;
    closing = true;
    server.close(() => redis.disconnect());
    setTimeout(() => {
      server.closeAllConnections();
      redis.disconnect();
    }, 9_000).unref();
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
