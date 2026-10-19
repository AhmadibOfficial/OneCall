import {
  ThrottlerModuleOptions,
} from '@nestjs/throttler';

import {
  ThrottlerStorageRedisService,
} from '@nest-lab/throttler-storage-redis';

function getRequiredRedisUrl(): string {
  const value = process.env.REDIS_URL?.trim();

  if (!value) {
    throw new Error(
      'REDIS_URL is required',
    );
  }

  return value;
}

function getPositiveInteger(
  name: string,
  fallback: number,
): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `${name} must be a positive integer`,
    );
  }

  return value;
}

export function buildThrottlerOptions():
  ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        name: 'default',
        limit: getPositiveInteger(
          'THROTTLE_GLOBAL_LIMIT',
          100,
        ),
        ttl: getPositiveInteger(
          'THROTTLE_GLOBAL_TTL_MS',
          60_000,
        ),
      },
    ],

    storage:
      new ThrottlerStorageRedisService(
        getRequiredRedisUrl(),
      ),
  };
}