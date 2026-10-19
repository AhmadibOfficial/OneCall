import 'dotenv/config';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';

// The legacy suites create database fixtures. They must run against disposable services.
if (process.env.ONECALL_ALLOW_TEST_DATABASE !== 'true') {
  throw new Error(
    'Use a disposable database and set ONECALL_ALLOW_TEST_DATABASE=true to run integration tests.',
  );
}
const prefix = `onecall:test:${randomBytes(12).toString('hex')}:`;
process.env.THROTTLE_KEY_PREFIX = prefix;
let redis: Redis;
beforeAll(async () => {
  redis = new Redis(process.env.REDIS_TEST_URL ?? process.env.REDIS_URL!, {
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
  });
  await redis.ping();
});
async function clearOwnedThrottleKeys() {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length) await redis.del(...keys);
}
// Isolate auth behavior assertions; the pilot suite tests real rate limits without resets.
beforeEach(clearOwnedThrottleKeys);
afterAll(async () => {
  try {
    if (redis?.status === 'ready') await clearOwnedThrottleKeys();
  } finally {
    redis?.disconnect();
  }
});
