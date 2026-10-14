import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

describe('Redis throttler storage', () => {
  const redisUrl = process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:6379/15';
  const prefix = `onecall:test:${randomBytes(12).toString('hex')}`;
  const ownedKeys: string[] = [];
  let redisA: Redis;
  let redisB: Redis;
  let storageA: ThrottlerStorageRedisService;
  let storageB: ThrottlerStorageRedisService;
  function key(label: string) {
    const value = `${prefix}:${label}`;
    ownedKeys.push(`{${value}:default}:hits`, `{${value}:default}:blocked`);
    return value;
  }
  beforeAll(async () => {
    const options = { connectTimeout: 2000, maxRetriesPerRequest: 1 };
    redisA = new Redis(redisUrl, options);
    redisB = new Redis(redisUrl, options);
    await Promise.all([redisA.ping(), redisB.ping()]);
    storageA = new ThrottlerStorageRedisService(redisA);
    storageB = new ThrottlerStorageRedisService(redisB);
  });
  afterAll(async () => {
    try {
      if (redisA?.status === 'ready' && ownedKeys.length)
        await redisA.del(...ownedKeys);
    } finally {
      redisA?.disconnect();
      redisB?.disconnect();
    }
  });
  test('shares throttle state across independent Redis connections', async () => {
    const value = key('shared');
    const first = await storageA.increment(value, 60000, 2, 60000, 'default');
    const second = await storageB.increment(value, 60000, 2, 60000, 'default');
    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
  });
  test('blocks after the shared limit is exceeded', async () => {
    const value = key('blocked');
    await storageA.increment(value, 60000, 2, 60000, 'default');
    await storageB.increment(value, 60000, 2, 60000, 'default');
    const third = await storageA.increment(value, 60000, 2, 60000, 'default');
    expect(third.totalHits).toBe(3);
    expect(third.isBlocked).toBe(true);
  });
});
