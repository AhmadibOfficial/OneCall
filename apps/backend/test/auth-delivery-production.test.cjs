'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const https = require('node:https');
const net = require('node:net');
const Redis = require('ioredis');
const { Pool } = require('pg');
const {
  readConfig,
  createDeliveryApp,
} = require('../scripts/auth-delivery/adapter.cjs');

if (
  process.env.ONECALL_ALLOW_TEST_DATABASE !== 'true' ||
  !process.env.REDIS_TEST_URL
) {
  throw new Error(
    'Use disposable PostgreSQL/Redis services to run production delivery tests',
  );
}

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test(
  'compiled production backend → signed HTTPS adapter → verification → booking → reset',
  { timeout: 30000 },
  async () => {
    const temporary = mkdtempSync(
      path.join(tmpdir(), 'onecall-delivery-test-'),
    );
    const certPath = path.join(temporary, 'test-cert.pem');
    const keyPath = path.join(temporary, 'test-key.pem');
    const stamp = randomBytes(8).toString('hex');
    const secret = 'onecall-disposable-production-delivery-secret-2026';
    const prefix = `onecall:delivery:production-test:${stamp}:`;
    const throttlePrefix = `onecall:throttle:production-test:${stamp}:`;
    const email = `delivery-${stamp}@example.com`;
    const password = 'DeliveryTest2026!';
    const db = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 3000,
    });
    const redis = new Redis(process.env.REDIS_TEST_URL, {
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    let adapter, backend;
    try {
      // A per-run test CA allows real TLS/HMAC verification without disabling certificate checks.
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-subj',
          '/CN=OneCall local delivery test',
          '-addext',
          'subjectAltName=IP:127.0.0.1',
          '-keyout',
          keyPath,
          '-out',
          certPath,
        ],
        { stdio: 'ignore', timeout: 10000 },
      );
      await redis.connect();
      await redis.ping();
      const config = readConfig({
        AUTH_DELIVERY_SECRET: secret,
        AUTH_DELIVERY_REDIS_URL: process.env.REDIS_TEST_URL,
        AUTH_DELIVERY_REDIS_PREFIX: prefix,
        RESEND_API_KEY: 'resend-test-key',
        AUTH_EMAIL_FROM: 'accounts@example.com',
        TERMII_API_KEY: 'termii-test-key',
        TERMII_BASE_URL: 'https://api.ng.termii.com',
        TERMII_SENDER_ID: 'OneCall',
      });
      const messages = [];
      const app = createDeliveryApp({
        config,
        redis,
        fetchImpl: async (url, options) => {
          assert.ok(
            [
              'https://api.resend.com/emails',
              'https://api.ng.termii.com/api/sms/send',
            ].includes(url),
          );
          messages.push({ url, body: JSON.parse(options.body) });
          return new Response(
            JSON.stringify({
              id: 'test-email-id',
              code: 'ok',
              message_id: 'test-sms-id',
            }),
          );
        },
      });
      adapter = https.createServer(
        { key: readFileSync(keyPath), cert: readFileSync(certPath) },
        app,
      );
      adapter.listen(0, '127.0.0.1');
      await once(adapter, 'listening');
      const backendPort = await freePort();
      backend = spawn(
        process.execPath,
        [path.resolve(__dirname, '../scripts/start-production.cjs')],
        {
          cwd: path.resolve(__dirname, '..'),
          stdio: 'ignore',
          env: {
            ...process.env,
            NODE_ENV: 'production',
            HOST: '127.0.0.1',
            PORT: String(backendPort),
            API_PREFIX: 'api/v1',
            TRUST_PROXY: '0',
            THROTTLE_KEY_PREFIX: throttlePrefix,
            AUTH_DELIVERY_URL: `https://127.0.0.1:${adapter.address().port}/challenges`,
            AUTH_DELIVERY_SECRET: secret,
            NODE_EXTRA_CA_CERTS: certPath,
          },
        },
      );
      let exit;
      backend.on('exit', (code) => {
        exit = code;
      });
      backend.on('error', () => {
        exit = -1;
      });
      const base = `http://127.0.0.1:${backendPort}/api/v1`;
      async function api(method, route, body, token) {
        const response = await fetch(base + route, {
          method,
          headers: {
            'content-type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        return { status: response.status, body: await response.json() };
      }
      let ready = false;
      for (let n = 0; n < 100; n++) {
        if (exit !== undefined)
          throw new Error('Compiled backend could not start');
        try {
          if ((await api('GET', '/health')).status === 200) {
            ready = true;
            break;
          }
        } catch {
          /* The child may still be starting. */
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(
        ready,
        true,
        'Compiled production backend must become healthy',
      );
      const registration = await api('POST', '/auth/register', {
        email,
        phone:
          '+2348' +
          String(BigInt('0x' + stamp) % 1_000_000_000n).padStart(9, '0'),
        password,
        firstName: 'Delivery',
        lastName: 'Test',
      });
      assert.equal(registration.status, 201);
      const login = await api('POST', '/auth/login', { email, password });
      assert.equal(login.status, 201);
      const access = login.body.accessToken;
      assert.equal(
        (await api('POST', '/orders', { serviceName: 'Tailoring' }, access))
          .status,
        403,
      );
      const requestedEmail = await api(
        'POST',
        '/auth/email-verification/request',
        {},
        access,
      );
      assert.equal(requestedEmail.status, 201);
      assert.deepEqual(requestedEmail.body, { accepted: true });
      const verification = messages[0].body.text.match(
        /[0-9a-f]{32}\.[0-9a-f]{128}/,
      )[0];
      assert.equal(
        (
          await api('POST', '/auth/email-verification/confirm', {
            verificationToken: verification,
          })
        ).status,
        201,
      );
      const requestedPhone = await api(
        'POST',
        '/auth/phone-verification/request',
        {},
        access,
      );
      assert.equal(requestedPhone.status, 201);
      assert.deepEqual(Object.keys(requestedPhone.body).sort(), [
        'accepted',
        'selector',
      ]);
      const code = messages[1].body.sms.match(/\b\d{6}\b/)[0];
      assert.equal(
        (
          await api('POST', '/auth/phone-verification/confirm', {
            selector: requestedPhone.body.selector,
            verificationCode: code,
          })
        ).status,
        201,
      );
      const me = await api('GET', '/users/me', undefined, access);
      assert.equal(me.status, 200);
      assert.equal(me.body.user.status, 'ACTIVE');
      assert.equal(me.body.user.emailVerified, true);
      assert.equal(me.body.user.phoneVerified, true);
      const order = await api(
        'POST',
        '/orders',
        {
          serviceName: 'Tailoring',
          address: 'Unguwan Rimi, Kaduna',
          description: 'Production-contract test',
        },
        access,
      );
      assert.equal(order.status, 201);
      assert.equal(order.body.status, 'PENDING');
      const status = await api(
        'GET',
        `/orders/${order.body.id}`,
        undefined,
        access,
      );
      assert.equal(status.status, 200);
      assert.equal(status.body.city, 'Kaduna');
      const reset = await api('POST', '/auth/password-reset/request', {
        email,
      });
      assert.equal(reset.status, 201);
      assert.deepEqual(reset.body, { accepted: true });
      assert.equal(messages.length, 3);
      const resetToken = messages[2].body.text.match(
        /[0-9a-f]{32}\.[0-9a-f]{128}/,
      )[0];
      assert.equal(
        (
          await api('POST', '/auth/password-reset/confirm', {
            resetToken,
            newPassword: 'ChangedPassword2026!',
          })
        ).status,
        201,
      );
      assert.equal(
        (await api('GET', '/users/me', undefined, access)).status,
        401,
      );
      assert.equal(
        (
          await api('POST', '/auth/refresh', {
            refreshToken: login.body.refreshToken,
          })
        ).status,
        401,
      );
    } finally {
      if (backend && backend.exitCode === null && backend.signalCode === null) {
        const stopped = once(backend, 'exit');
        backend.kill('SIGTERM');
        await stopped;
      }
      if (adapter) {
        adapter.closeAllConnections();
        await new Promise((resolve) => adapter.close(resolve));
      }
      try {
        await db.query(
          'DELETE FROM "Order" WHERE "customerId" IN (SELECT id FROM "User" WHERE email = $1)',
          [email],
        );
        await db.query('DELETE FROM "User" WHERE email = $1', [email]);
      } finally {
        await db.end();
      }
      try {
        if (redis.status === 'ready') {
          const keys = [
            ...(await redis.keys(`${prefix}*`)),
            ...(await redis.keys(`${throttlePrefix}*`)),
          ];
          if (keys.length) await redis.del(...keys);
        }
      } finally {
        redis.disconnect();
        rmSync(temporary, { recursive: true, force: true });
      }
    }
  },
);
