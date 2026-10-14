'use strict';

const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, randomBytes } = require('node:crypto');
const Redis = require('ioredis');
const request = require('supertest');
const {
  readConfig,
  createDeliveryApp,
} = require('../scripts/auth-delivery/adapter.cjs');

if (
  process.env.ONECALL_ALLOW_TEST_DATABASE !== 'true' ||
  !process.env.REDIS_TEST_URL
) {
  throw new Error(
    'Set ONECALL_ALLOW_TEST_DATABASE=true and REDIS_TEST_URL for disposable services',
  );
}

describe('Authentication delivery: real HTTP + Redis; mocked vendor calls', () => {
  const secret = 'onecall-disposable-adapter-test-secret-2026';
  const now = Date.now();
  const env = {
    AUTH_DELIVERY_SECRET: secret,
    AUTH_DELIVERY_REDIS_URL: process.env.REDIS_TEST_URL,
    AUTH_DELIVERY_REDIS_PREFIX: `onecall:delivery:test:${randomBytes(12).toString('hex')}:`,
    RESEND_API_KEY: 'resend-test-key',
    AUTH_EMAIL_FROM: 'accounts@example.com',
    TERMII_API_KEY: 'termii-test-key',
    TERMII_BASE_URL: 'https://api.ng.termii.com',
    TERMII_SENDER_ID: 'OneCall',
  };
  const config = readConfig(env);
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 2000,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  let calls;
  let respond;
  const app = createDeliveryApp({
    config,
    redis,
    now: () => now,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return respond();
    },
  });
  before(async () => {
    await redis.connect();
    await redis.ping();
  });
  after(async () => {
    try {
      const keys = await redis.keys(`${config.prefix}*`);
      if (keys.length) await redis.del(...keys);
    } finally {
      redis.disconnect();
    }
  });
  beforeEach(() => {
    calls = [];
    respond = () =>
      new Response(
        JSON.stringify({
          id: 'email-test-id',
          code: 'ok',
          message_id: 'sms-test-id',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
  });
  function challenge(kind = 'phone-verification') {
    return {
      kind,
      recipient:
        kind === 'phone-verification' ? '+2348012345678' : 'pilot@example.com',
      selector: randomBytes(16).toString('hex'),
      secret: kind === 'phone-verification' ? '123456' : 'a'.repeat(128),
      expiresAt: new Date(now + 9 * 60_000).toISOString(),
    };
  }
  function send(
    value,
    { timestamp = Math.floor(now / 1000), key = secret, raw } = {},
  ) {
    const body = raw ?? JSON.stringify(value);
    const signature = createHmac('sha256', key)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    return request(app)
      .post('/challenges')
      .set('content-type', 'application/json')
      .set('x-onecall-signature', `t=${timestamp},v1=${signature}`)
      .send(body);
  }

  test('configuration refuses missing credentials, insecure/foreign origins and header injection', () => {
    for (const field of [
      'AUTH_DELIVERY_SECRET',
      'RESEND_API_KEY',
      'TERMII_API_KEY',
      'AUTH_EMAIL_FROM',
    ]) {
      assert.throws(() => readConfig({ ...env, [field]: '' }));
    }
    for (const origin of [
      'http://api.ng.termii.com',
      'https://evil.example.com',
      'https://api.ng.termii.com/other',
      'https://user:password@api.ng.termii.com',
    ]) {
      assert.throws(() => readConfig({ ...env, TERMII_BASE_URL: origin }));
    }
    assert.throws(() =>
      readConfig({
        ...env,
        AUTH_EMAIL_FROM: 'account@example.com\r\nBcc: other@example.com',
      }),
    );
  });
  test('health checks Redis without disclosing configuration', async () => {
    const response = await request(app).get('/health').expect(200);
    assert.deepEqual(response.body, { status: 'ok' });
    assert.equal(response.headers['x-powered-by'], undefined);
    assert.equal(response.headers['cache-control'], 'no-store');
  });
  test('unsigned and incorrectly signed requests cannot call a vendor', async () => {
    await request(app).post('/challenges').send(challenge()).expect(401);
    await send(challenge(), { key: 'incorrect-secret' }).expect(401);
    assert.equal(calls.length, 0);
  });
  test('stale and far-future timestamps are rejected', async () => {
    await send(challenge(), { timestamp: Math.floor(now / 1000) - 301 }).expect(
      401,
    );
    await send(challenge(), { timestamp: Math.floor(now / 1000) + 31 }).expect(
      401,
    );
    assert.equal(calls.length, 0);
  });
  test('signature covers the exact bytes, not parsed JSON', async () => {
    const value = challenge();
    const body = JSON.stringify(value);
    const timestamp = Math.floor(now / 1000);
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    await request(app)
      .post('/challenges')
      .set('content-type', 'application/json')
      .set('x-onecall-signature', `t=${timestamp},v1=${signature}`)
      .send(body + ' ')
      .expect(401);
    assert.equal(calls.length, 0);
  });
  test('rejects malformed JSON, excessive bodies and wrong content type', async () => {
    await send(null, { raw: '{broken' }).expect(400);
    await send(null, { raw: 'x'.repeat(9000) }).expect(413);
    await request(app)
      .post('/challenges')
      .set('content-type', 'text/plain')
      .send('text')
      .expect(415);
    assert.equal(calls.length, 0);
  });
  test('rejects invalid codes/recipients, extra fields and expired challenges', async () => {
    const value = challenge();
    for (const bad of [
      { ...value, recipient: '08012345678' },
      { ...value, secret: '12345' },
      { ...value, selector: '../not-a-selector' },
      { ...value, kind: 'arbitrary-message' },
      { ...value, extra: true },
      { ...value, expiresAt: new Date(now - 1).toISOString() },
      { ...value, expiresAt: new Date(now + 12 * 60_000).toISOString() },
    ])
      await send(bad).expect(400);
    assert.equal(calls.length, 0);
  });
  test('SMS uses an international number and the transactional DND route', async () => {
    await send(challenge()).expect(204);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.ng.termii.com/api/sms/send');
    const payload = JSON.parse(calls[0].options.body);
    assert.deepEqual(payload, {
      to: '2348012345678',
      from: 'OneCall',
      sms: 'Your OneCall verification code is 123456. It expires in 10 minutes. Do not share this code.',
      type: 'plain',
      channel: 'dnd',
      api_key: 'termii-test-key',
    });
    assert.equal(calls[0].options.redirect, 'error');
  });
  for (const kind of ['email-verification', 'password-reset']) {
    test(`${kind} email has the usable token and provider idempotency key`, async () => {
      const value = challenge(kind);
      const response = await send(value).expect(204);
      const { url, options } = calls[0];
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(options.headers.Authorization, 'Bearer resend-test-key');
      assert.ok(
        options.headers['Idempotency-Key'].startsWith(
          `onecall-${kind}-${value.selector}-`,
        ),
      );
      const payload = JSON.parse(options.body);
      assert.deepEqual(payload.to, ['pilot@example.com']);
      assert.equal(payload.from, 'accounts@example.com');
      assert.ok(payload.text.includes(`${value.selector}.${value.secret}`));
      assert.ok(payload.text.includes(value.expiresAt));
      assert.equal(response.text, '');
    });
  }
  test('completed duplicate delivery succeeds once, including whitespace changes', async () => {
    const value = challenge();
    await send(value).expect(204);
    await send(value, { raw: JSON.stringify(value, null, 2) }).expect(204);
    assert.equal(calls.length, 1);
  });
  test('simultaneous signed deliveries claim exactly one vendor call', async () => {
    const value = challenge();
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    respond = async () => {
      await held;
      return new Response(
        JSON.stringify({ code: 'ok', message_id: 'sms-test-id' }),
      );
    };
    // Release only after all concurrent losers have responded, proving real Redis exclusion.
    let early = 0;
    const responses = Array.from({ length: 8 }, () =>
      send(value).then((result) => {
        if (result.status === 503) early++;
        return result.status;
      }),
    );
    // Arrival order is unspecified. Seven losers reply while the owner is still waiting.
    try {
      for (let n = 0; n < 100 && early < 7; n++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(early, 7);
      assert.equal(calls.length, 1);
    } finally {
      release();
    }
    const statuses = await Promise.all(responses);
    assert.equal(statuses.filter((status) => status === 204).length, 1);
    assert.equal(statuses.filter((status) => status === 503).length, 7);
  });
  test('changed payload with the same selector cannot send a second message', async () => {
    const value = challenge();
    await send(value).expect(204);
    await send({ ...value, recipient: '+2348098765432' }).expect(409);
    assert.equal(calls.length, 1);
  });
  test('ambiguous network failure is private and does not resend the same SMS', async () => {
    respond = () => {
      throw new Error('provider API_KEY secret 123456 pilot@example.com');
    };
    const value = challenge();
    const response = await send(value).expect(503);
    assert.deepEqual(response.body, {
      message: 'Authentication delivery is unavailable',
    });
    await send(value).expect(503);
    assert.equal(calls.length, 1);
    respond = () =>
      new Response(JSON.stringify({ code: 'ok', message_id: 'next-id' }));
    await send(challenge()).expect(204);
  });
  test('an HTTP-200 vendor error is never reported as accepted', async () => {
    respond = () =>
      new Response(
        JSON.stringify({
          code: 'insufficient_balance',
          message: 'private account details',
        }),
      );
    await send(challenge()).expect(503);
    respond = () =>
      new Response(JSON.stringify({ message: 'private account details' }));
    await send(challenge('email-verification')).expect(503);
  });
  test('a missing Redis receipt store fails closed before contacting a vendor', async () => {
    const unavailable = createDeliveryApp({
      config,
      now: () => now,
      redis: {
        eval: async () => {
          throw new Error('redis credentials');
        },
      },
      fetchImpl: async () => {
        assert.fail('Vendor must not be called');
      },
    });
    const body = JSON.stringify(challenge());
    const timestamp = Math.floor(now / 1000);
    const digest = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    await request(unavailable)
      .post('/challenges')
      .set('content-type', 'application/json')
      .set('x-onecall-signature', `t=${timestamp},v1=${digest}`)
      .send(body)
      .expect(503);
  });
});
