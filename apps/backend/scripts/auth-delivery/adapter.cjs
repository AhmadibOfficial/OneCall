'use strict';

const express = require('express');
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');

class DeliveryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function required(env, name) {
  const value = env[name];
  if (!value || value !== value.trim() || /[\r\n]/.test(value)) {
    throw new Error(
      `Configure ${name} before starting authentication delivery`,
    );
  }
  return value;
}

function readConfig(env = process.env) {
  const secret = required(env, 'AUTH_DELIVERY_SECRET');
  if (secret.length < 32)
    throw new Error('AUTH_DELIVERY_SECRET must have at least 32 characters');
  const redisUrl = required(env, 'AUTH_DELIVERY_REDIS_URL');
  const redis = new URL(redisUrl);
  if (!['redis:', 'rediss:'].includes(redis.protocol) || !redis.hostname) {
    throw new Error('AUTH_DELIVERY_REDIS_URL must be a Redis URL');
  }
  const termiiUrl = new URL(required(env, 'TERMII_BASE_URL'));
  if (
    termiiUrl.protocol !== 'https:' ||
    !/(^|\.)termii\.com$/.test(termiiUrl.hostname) ||
    termiiUrl.username ||
    termiiUrl.password ||
    termiiUrl.search ||
    termiiUrl.hash ||
    termiiUrl.port ||
    termiiUrl.pathname !== '/'
  ) {
    throw new Error(
      'TERMII_BASE_URL must be the HTTPS Termii origin shown in your dashboard',
    );
  }
  const sender = required(env, 'TERMII_SENDER_ID');
  if (!/^[A-Za-z0-9]{3,11}$/.test(sender)) {
    throw new Error(
      'TERMII_SENDER_ID must be an approved 3–11 character alphanumeric sender',
    );
  }
  const emailFrom = required(env, 'AUTH_EMAIL_FROM');
  if (
    emailFrom.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(emailFrom)
  ) {
    throw new Error(
      'AUTH_EMAIL_FROM must be an email address on your verified sending domain',
    );
  }
  const prefix = env.AUTH_DELIVERY_REDIS_PREFIX ?? 'onecall:delivery:v1:';
  if (!/^[A-Za-z0-9:_-]{1,100}$/.test(prefix))
    throw new Error('Invalid AUTH_DELIVERY_REDIS_PREFIX');
  const port = Number(env.AUTH_DELIVERY_PORT ?? '3010');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid AUTH_DELIVERY_PORT');
  return Object.freeze({
    secret,
    redisUrl,
    prefix,
    port,
    host: env.AUTH_DELIVERY_HOST ?? '127.0.0.1',
    emailFrom,
    resendKey: required(env, 'RESEND_API_KEY'),
    termiiKey: required(env, 'TERMII_API_KEY'),
    termiiUrl: new URL('/api/sms/send', termiiUrl).href,
    sender,
  });
}

function authenticate(raw, header, secret, now) {
  const match =
    typeof header === 'string' && /^t=(\d{10}),v1=([0-9a-f]{64})$/.exec(header);
  if (!match) throw new DeliveryError(401, 'Invalid delivery signature');
  const timestamp = Number(match[1]);
  const seconds = Math.floor(now / 1000);
  if (timestamp < seconds - 300 || timestamp > seconds + 30) {
    throw new DeliveryError(401, 'Invalid delivery signature');
  }
  const digest = createHmac('sha256', secret)
    .update(`${match[1]}.`)
    .update(raw)
    .digest();
  if (!timingSafeEqual(digest, Buffer.from(match[2], 'hex'))) {
    throw new DeliveryError(401, 'Invalid delivery signature');
  }
}

function parseChallenge(raw, now) {
  let value;
  try {
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    /* Report a safe error below. */
  }
  const keys = ['kind', 'recipient', 'selector', 'secret', 'expiresAt'];
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => typeof value[key] !== 'string') ||
    !['email-verification', 'phone-verification', 'password-reset'].includes(
      value.kind,
    ) ||
    !/^[0-9a-f]{32}$/.test(value.selector)
  ) {
    throw new DeliveryError(400, 'Invalid challenge');
  }
  const phone = value.kind === 'phone-verification';
  const recipientValid = phone
    ? /^\+[1-9]\d{7,14}$/.test(value.recipient)
    : value.recipient.length <= 254 &&
      /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.recipient);
  if (
    !recipientValid ||
    !(phone ? /^\d{6}$/ : /^[0-9a-f]{128}$/).test(value.secret)
  ) {
    throw new DeliveryError(400, 'Invalid challenge');
  }
  const expires = Date.parse(value.expiresAt);
  const maxTtl = phone
    ? 11 * 60_000
    : value.kind === 'password-reset'
      ? 61 * 60_000
      : 25 * 3600_000;
  if (!Number.isFinite(expires) || expires <= now || expires - now > maxTtl) {
    throw new DeliveryError(400, 'Invalid challenge expiry');
  }
  return { ...value, expires };
}

async function sendToProvider(challenge, config, fingerprint, fetchImpl) {
  const phone = challenge.kind === 'phone-verification';
  const reset = challenge.kind === 'password-reset';
  const token = `${challenge.selector}.${challenge.secret}`;
  const expiry = new Date(challenge.expires).toISOString();
  const text = reset
    ? `A password reset was requested for your OneCall account.\n\nReset token: ${token}\n\nExpires: ${expiry}\nIf you did not request this, ignore this email.`
    : `Verify your OneCall email. Paste this token into the Verify account screen:\n\n${token}\n\nExpires: ${expiry}\nDo not share this token.`;
  const response = await fetchImpl(
    phone ? config.termiiUrl : 'https://api.resend.com/emails',
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(7_000),
      headers: phone
        ? { 'content-type': 'application/json' }
        : {
            'content-type': 'application/json',
            Authorization: `Bearer ${config.resendKey}`,
            'Idempotency-Key': `onecall-${challenge.kind}-${challenge.selector}-${fingerprint}`,
          },
      body: JSON.stringify(
        phone
          ? {
              to: challenge.recipient.slice(1),
              from: config.sender,
              sms: `Your OneCall verification code is ${challenge.secret}. It expires in 10 minutes. Do not share this code.`,
              type: 'plain',
              channel: 'dnd',
              api_key: config.termiiKey,
            }
          : {
              from: config.emailFrom,
              to: [challenge.recipient],
              subject: reset
                ? 'Reset your OneCall password'
                : 'Verify your OneCall email',
              text,
            },
      ),
    },
  );
  // Never include a provider response (which may echo credentials/PII) in errors.
  if (!response.ok)
    throw new DeliveryError(503, 'Authentication delivery is unavailable');
  const result = await response.json();
  if (
    phone
      ? result?.code !== 'ok' || !(result.message_id_str || result.message_id)
      : typeof result?.id !== 'string' || !result.id
  ) {
    throw new DeliveryError(503, 'Authentication delivery is unavailable');
  }
}

const CLAIM = `
local existing = redis.call('GET', KEYS[1])
if existing then return existing end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')
return 'claimed'
`;
const MARK_SENT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
  return 1
end
return 0
`;

function createDeliveryApp({
  config,
  redis,
  fetchImpl = fetch,
  now = Date.now,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/health', async (_req, res) => {
    try {
      await redis.ping();
      res.json({ status: 'ok' });
    } catch {
      res
        .status(503)
        .json({ message: 'Authentication delivery is unavailable' });
    }
  });
  app.post(
    '/challenges',
    express.raw({ type: 'application/json', limit: '8kb' }),
    async (req, res) => {
      try {
        if (!Buffer.isBuffer(req.body))
          throw new DeliveryError(415, 'Use application/json');
        const timestamp = now();
        authenticate(
          req.body,
          req.get('x-onecall-signature'),
          config.secret,
          timestamp,
        );
        const challenge = parseChallenge(req.body, timestamp);
        // Hash canonical challenge data so whitespace changes cannot bypass deduplication.
        const fingerprint = createHash('sha256')
          .update(
            JSON.stringify([
              challenge.kind,
              challenge.recipient,
              challenge.selector,
              challenge.secret,
              challenge.expiresAt,
            ]),
          )
          .digest('hex');
        const key = `${config.prefix}${challenge.kind}:${challenge.selector}`;
        const pending = `pending:${fingerprint}`;
        const sent = `sent:${fingerprint}`;
        const receipt = await redis.eval(
          CLAIM,
          1,
          key,
          pending,
          challenge.expires - timestamp + 24 * 3600_000,
        );
        if (receipt === sent) {
          res.status(204).end();
          return;
        }
        if (receipt !== 'claimed') {
          throw new DeliveryError(
            receipt.endsWith(fingerprint) ? 503 : 409,
            'Authentication delivery is unavailable',
          );
        }
        // Keep pending on timeout/error/crash: SMS acceptance can be ambiguous, so a
        // duplicate must never blindly send again. A new backend request issues a new selector.
        await sendToProvider(challenge, config, fingerprint, fetchImpl);
        if ((await redis.eval(MARK_SENT, 1, key, pending, sent)) !== 1) {
          throw new DeliveryError(
            503,
            'Authentication delivery is unavailable',
          );
        }
        res.status(204).end();
      } catch (error) {
        const status = error instanceof DeliveryError ? error.status : 503;
        res.status(status).json({
          message:
            error instanceof DeliveryError
              ? error.message
              : 'Authentication delivery is unavailable',
        });
      }
    },
  );
  app.use((_req, res) => res.status(404).json({ message: 'Not found' }));
  app.use((error, _req, res, _next) => {
    res
      .status(error.type === 'entity.too.large' ? 413 : 400)
      .json({ message: 'Invalid delivery request' });
  });
  return app;
}

module.exports = { readConfig, createDeliveryApp };
