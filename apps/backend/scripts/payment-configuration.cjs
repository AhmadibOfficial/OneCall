'use strict';

function callbackUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.port ||
      url.hostname === 'localhost' ||
      url.hostname.endsWith('.localhost') ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]'
    )
      return '';
    return url.href;
  } catch {
    return '';
  }
}

/** One policy shared by the runtime gateway and the cloud startup gate. */
function paymentConfiguration(env = process.env) {
  const mode = env.ONECALL_PAYMENT_MODE || 'disabled';
  const secret = env.PAYSTACK_SECRET_KEY || '';
  let callback = callbackUrl(env.PAYSTACK_CALLBACK_URL);
  if (!env.PAYSTACK_CALLBACK_URL && env.RENDER_EXTERNAL_URL) {
    const origin = callbackUrl(env.RENDER_EXTERNAL_URL);
    const prefix = env.API_PREFIX || 'api/v1';
    if (
      origin &&
      new URL(origin).pathname === '/' &&
      /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix)
    )
      callback = new URL('/' + prefix + '/payments/paystack/return', origin)
        .href;
  }
  const wallet = env.ONECALL_WALLET_ENABLED === 'true';
  const validMode = ['disabled', 'test', 'live'].includes(mode);
  const valid =
    validMode &&
    (mode === 'disabled'
      ? !secret && !wallet
      : new RegExp('^sk_' + mode + '_[A-Za-z0-9]+$').test(secret) &&
        (!env.PAYSTACK_CALLBACK_URL || !!callback) &&
        (mode !== 'live' ||
          (env.ONECALL_PAYMENTS_LIVE_APPROVED === 'true' &&
            !!callback &&
            !wallet)));
  return {
    mode: validMode ? mode : 'disabled',
    valid,
    enabled: valid && mode !== 'disabled',
    walletEnabled: valid && mode === 'test' && wallet,
    callbackUrl: callback,
  };
}
module.exports = { paymentConfiguration };
