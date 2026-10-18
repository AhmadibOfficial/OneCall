'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checks, probe, deliveryUrl } = require('../scripts/release-readiness.cjs');
function configured() {
  return {
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    DATABASE_URL: 'postgresql://account:secret@private/db',
    REDIS_URL: 'redis://private:6379',
    JWT_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    PAYMENT_WEBHOOK_SECRET: 'c'.repeat(40),
    AUTH_DELIVERY_SECRET: 'd'.repeat(40),
    AUTH_DELIVERY_URL: 'https://delivery.domain.test/challenges',
    ONECALL_UPLOADS_ENABLED: 'false',
    ONECALL_SOCIAL_LOGIN_ENABLED: 'false',
    ONECALL_WALLET_ENABLED: 'false',
  };
}
test('preview has honest upload limits and readiness output discloses no private values', () => {
  const e = configured();
  const result = checks(e);
  assert.equal(result.ready, true);
  const text = JSON.stringify(result);
  for (const secret of [e.JWT_SECRET, e.DATABASE_URL, e.AUTH_DELIVERY_SECRET])
    assert.ok(!text.includes(secret));
  assert.equal(result.providerDeliveryTested, false);
});
test('enabled uploads require an absolute persistent path; placeholders, HTTP delivery and enabled payments fail', () => {
  for (const change of [
    { ONECALL_UPLOADS_ENABLED: 'true' },
    { AUTH_DELIVERY_URL: 'http://delivery.domain.test/challenges' },
    {
      JWT_SECRET: 'replace-this-with-a-random-secret-of-at-least-32-characters',
    },
    { ONECALL_WALLET_ENABLED: 'true' },
    { CORS_ORIGINS: '*' },
    { JWT_REFRESH_SECRET: 'a'.repeat(40) },
  ])
    assert.equal(checks({ ...configured(), ...change }).ready, false);
  assert.equal(
    checks({
      ...configured(),
      ONECALL_UPLOADS_ENABLED: 'true',
      ONECALL_STORAGE_PERSISTENT: 'true',
      ONECALL_UPLOAD_ROOT: '/var/lib/onecall/private',
    }).ready,
    true,
  );
});
test('public probe reads health and public legal pages and sends no messages', async () => {
  const previous = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response('{}', { status: 200 });
  };
  try {
    assert.equal((await probe('https://onecall.domain.test')).ready, true);
    assert.deepEqual(
      calls.map((x) => new URL(x.url).pathname),
      [
        '/api/v1/health/ready',
        '/legal/privacy.html',
        '/legal/account-deletion.html',
      ],
    );
    assert.ok(
      calls.every(
        (x) =>
          !x.options.method &&
          !x.options.body &&
          x.options.redirect === 'error',
      ),
    );
    await assert.rejects(probe('http://localhost'));
  } finally {
    global.fetch = previous;
  }
});
test('Render delivery origin resolves to the signed challenge endpoint without exposing secrets', () => {
  const env = configured();
  delete env.AUTH_DELIVERY_URL;
  env.AUTH_DELIVERY_ORIGIN = 'https://onecall-delivery.onrender.com';
  assert.equal(deliveryUrl(env), 'https://onecall-delivery.onrender.com/challenges');
  assert.equal(checks(env).ready, true);
  assert.ok(!JSON.stringify(checks(env)).includes(env.AUTH_DELIVERY_SECRET));
  env.AUTH_DELIVERY_URL = 'https://custom.domain.test/challenges';
  assert.equal(deliveryUrl(env), env.AUTH_DELIVERY_URL);
});
test('invalid delivery origins stay blocked instead of being converted into usable configuration', () => {
  for (const origin of [
    '', 'http://onecall-delivery.onrender.com',
    'https://account:secret@onecall-delivery.onrender.com',
    'https://onecall-delivery.onrender.com/another-path',
    'https://onecall-delivery.onrender.com?token=secret',
    'https://onecall-delivery.onrender.com#fragment',
  ]) {
    const env = configured();
    delete env.AUTH_DELIVERY_URL;
    env.AUTH_DELIVERY_ORIGIN = origin;
    assert.equal(checks(env).ready, false);
  }
  assert.equal(checks({ ...configured(), AUTH_DELIVERY_URL: 'http://unsafe.test', AUTH_DELIVERY_ORIGIN: 'https://safe.test' }).ready, false);
});
