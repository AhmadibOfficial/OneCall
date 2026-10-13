'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const {
  configureApplication,
} = require('../dist/bootstrap/configure-application');

class LegalTestModule {}
Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: (key) => (key === 'API_PREFIX' ? 'api/v1' : undefined),
      },
    },
  ],
})(LegalTestModule);

let app;
let base;
const previousEnvironment = process.env.NODE_ENV;
before(async () => {
  process.env.NODE_ENV = 'production';
  app = await NestFactory.create(LegalTestModule, { logger: false });
  configureApplication(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => {
  if (app) await app.close();
  if (previousEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;
});

test('public documents and navigation work without a login or cookies', async () => {
  const names = [
    'index',
    'privacy',
    'terms',
    'payments',
    'consumer',
    'storage',
    'providers',
    'account-deletion',
  ];
  for (const name of names) {
    const response = await fetch(`${base}/legal/${name}.html`);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    const body = await response.text();
    assert.match(body, /OneCall/);
    assert.match(body, /Pilot draft for review/);
    assert.doesNotMatch(body, /Tasko|Flutterwave/);
    for (const link of body.matchAll(/href="([a-z-]+\.html)"/g)) {
      assert.ok(names.includes(link[1].replace('.html', '')), link[1]);
    }
  }
  assert.equal((await fetch(`${base}/legal/`)).status, 200);
  const style = await fetch(`${base}/legal/style.css`);
  assert.equal(style.status, 200);
  assert.match(style.headers.get('content-type'), /text\/css/);
});

test('deletion route offers a request without requiring reinstallation', async () => {
  const response = await fetch(`${base}/legal/account-deletion.html`);
  const body = await response.text();
  assert.match(
    body,
    /mailto:onecalltech@gmail\.com\?subject=OneCall%20account%20deletion/,
  );
  assert.match(body, /without signing in or reinstalling/);
  assert.match(body, /manual handling/);
  assert.match(body, /does not automatically delete/);
});

test('legal pages preserve production security headers without inline scripts', async () => {
  const response = await fetch(`${base}/legal/`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.match(
    response.headers.get('strict-transport-security'),
    /max-age=31536000/,
  );
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  const body = await response.text();
  assert.doesNotMatch(body, /<script|<style|\sstyle=|\son[a-z]+=/);
});

test('unknown and private document paths remain unavailable', async () => {
  for (const path of ['missing.html', '.env', 'onecall-policies.json']) {
    const response = await fetch(`${base}/legal/${path}`);
    assert.ok(
      [403, 404].includes(response.status),
      `${path}: ${response.status}`,
    );
  }
});
