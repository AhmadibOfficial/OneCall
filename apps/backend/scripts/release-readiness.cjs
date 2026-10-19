'use strict';
const { isAbsolute } = require('node:path');
function secureUrl(value, originOnly = false) {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      (!originOnly || u.pathname === '/')
    );
  } catch {
    return false;
  }
}
function freshSecret(value) {
  return (
    typeof value === 'string' &&
    value.length >= 32 &&
    value.trim() === value &&
    !/replace|example|placeholder|disposable|local.only/i.test(value)
  );
}
function deliveryUrl(env = process.env) {
  if (env.AUTH_DELIVERY_URL) return env.AUTH_DELIVERY_URL;
  if (!secureUrl(env.AUTH_DELIVERY_ORIGIN, true)) return '';
  return new URL('/challenges', env.AUTH_DELIVERY_ORIGIN).href;
}
function checks(env = process.env, component = 'api') {
  const results = [];
  const add = (name, ok) =>
    results.push({ name, status: ok ? 'ready' : 'missing_or_invalid' });
  if (component === 'delivery') {
    try {
      require('./auth-delivery/adapter.cjs').readConfig(env);
      add('delivery_configuration', true);
    } catch {
      add('delivery_configuration', false);
    }
    add('delivery_signing_secret', freshSecret(env.AUTH_DELIVERY_SECRET));
    add('delivery_public_binding', env.AUTH_DELIVERY_HOST === '0.0.0.0');
  } else {
    add('production_mode', env.NODE_ENV === 'production');
    add('public_binding', env.HOST === '0.0.0.0');
    for (const key of [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'PAYMENT_WEBHOOK_SECRET',
      'AUTH_DELIVERY_SECRET',
    ])
      add(key, freshSecret(env[key]));
    add('distinct_session_secrets', env.JWT_SECRET !== env.JWT_REFRESH_SECRET);
    add(
      'database_configured',
      /^postgres(?:ql)?:\/\//.test(env.DATABASE_URL || ''),
    );
    add('redis_configured', /^rediss?:\/\//.test(env.REDIS_URL || ''));
    add('verification_adapter_https', secureUrl(deliveryUrl(env)));
    add(
      'persistent_uploads_or_preview_disabled',
      env.ONECALL_UPLOADS_ENABLED === 'false' ||
        (env.ONECALL_STORAGE_PERSISTENT === 'true' &&
          isAbsolute(env.ONECALL_UPLOAD_ROOT || '')),
    );
    add(
      'payments_deferred',
      !env.PAYSTACK_SECRET_KEY && env.ONECALL_WALLET_ENABLED !== 'true',
    );
    add('social_production_gate', env.ONECALL_SOCIAL_LOGIN_ENABLED !== 'true');
    const origins = (env.CORS_ORIGINS || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    add(
      'exact_https_web_origins',
      origins.every((x) => secureUrl(x, true)),
    );
  }
  return {
    component,
    ready: results.every((x) => x.status === 'ready'),
    checks: results,
    providerDeliveryTested: false,
  };
}
async function probe(base) {
  if (!secureUrl(base)) throw new Error('Use a public HTTPS origin');
  const origin = new URL(base).origin;
  const paths = [
    '/api/v1/health/ready',
    '/legal/privacy.html',
    '/legal/account-deletion.html',
  ];
  const output = [];
  for (const path of paths) {
    try {
      const r = await fetch(origin + path, {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      output.push({ path, status: r.status, reachable: r.ok });
      await r.body?.cancel();
    } catch {
      output.push({ path, status: null, reachable: false });
    }
  }
  return { ready: output.every((x) => x.reachable), checks: output };
}
module.exports = { checks, secureUrl, freshSecret, probe, deliveryUrl };
if (require.main === module) {
  require('dotenv').config({
    path: process.env.ONECALL_RELEASE_ENV_FILE || '.env.production',
    quiet: true,
  });
  const component = process.argv.includes('--delivery') ? 'delivery' : 'api';
  const i = process.argv.indexOf('--public-url');
  const run =
    i < 0
      ? Promise.resolve(checks(process.env, component))
      : probe(process.argv[i + 1]);
  run
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ready) process.exitCode = 1;
    })
    .catch(() => {
      console.error('Readiness check failed; private values were not logged.');
      process.exitCode = 1;
    });
}
