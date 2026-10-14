import {
  generateKeyPairSync,
  verify as verifyEd25519,
} from 'node:crypto';
import {
  AMBOY_ASSERTION_AUDIENCE,
  AMBOY_ASSERTION_SCOPE,
  AMBOY_ASSERTION_TTL,
  AMBOY_ASSERTION_TYPE,
  issueDedicatedAmboyIdentityAssertion,
  type AuthoritativeIdentitySnapshot,
  type IssuerConfiguration,
} from './amboy-identity-issuer';

const SUBJECT = 'a53a56c0-0c2d-45ef-8e98-1450cd38b923';
const TIME = 1790000000;
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const config: IssuerConfiguration = {
  enabled: true,
  issuer: 'https://onecall-identity.invalid',
  keyId: 'onecall-test-key-2026',
  privateKeyPem: pem,
};
const active: AuthoritativeIdentitySnapshot = {
  id: SUBJECT, status: 'ACTIVE', tokenVersion: 7,
  emailVerified: true, phoneVerified: true,
  deletedAt: null, lockedUntil: null,
};
const principal = { id: SUBJECT, tokenVersion: 7 };
const issue = (overrides: Partial<AuthoritativeIdentitySnapshot> = {},
  options: { principal?: typeof principal; issuer?: IssuerConfiguration } = {}) =>
  issueDedicatedAmboyIdentityAssertion({
    authenticatedPrincipal: options.principal ?? principal,
    loadAuthoritativeUser: async () => ({ ...active, ...overrides }),
    config: options.issuer ?? config,
    nowSeconds: TIME,
  });

test('dedicated JWS matches immutable MetaAutomate P2-02a contract', async () => {
  const token = await issue();
  const [head, claims, signature] = token.split('.');
  expect(token.split('.')).toHaveLength(3);
  expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({
    alg: 'EdDSA', typ: AMBOY_ASSERTION_TYPE, kid: config.keyId,
  });
  const body = JSON.parse(Buffer.from(claims, 'base64url').toString());
  expect(Object.keys(body).sort()).toEqual([
    'aud', 'authority', 'exp', 'iat', 'iss', 'jti', 'nbf',
    'product', 'scope', 'sub', 'token_version',
  ]);
  expect(body).toMatchObject({
    iss: config.issuer, aud: AMBOY_ASSERTION_AUDIENCE,
    sub: SUBJECT, iat: TIME, nbf: TIME, exp: TIME + AMBOY_ASSERTION_TTL,
    product: 'onecall', scope: AMBOY_ASSERTION_SCOPE,
    token_version: 7, authority: 'onecall-backend',
  });
  expect(body).not.toHaveProperty('email');
  expect(body).not.toHaveProperty('tenant_id');
  expect(body).not.toHaveProperty('organization_id');
  expect(verifyEd25519(null, Buffer.from(head + '.' + claims, 'ascii'),
    publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  const token2 = await issue();
  const body2 = JSON.parse(Buffer.from(token2.split('.')[1], 'base64url').toString());
  expect(body2.jti).not.toBe(body.jti);
});

test.each([
  ['revoked token version', { tokenVersion: 8 }],
  ['blocked user', { status: 'BLOCKED' }],
  ['pending user', { status: 'PENDING' }],
  ['deleted user', { deletedAt: new Date(TIME * 1000) }],
  ['unverified email', { emailVerified: false }],
  ['unverified phone', { phoneVerified: false }],
  ['active lockout', { lockedUntil: new Date(TIME * 1000 + 15000) }],
  ['different subject', { id: '23719577-b268-4dc4-ac72-69274bc5ff3a' }],
])('%s cannot obtain an assertion', async (_label, changes) => {
  await expect(issue(changes)).rejects.toThrow(
    'Dedicated OneCall identity assertion is unavailable',
  );
});

test('must not sign a client-forged identity or wrong auth version', async () => {
  await expect(issue({}, { principal: { ...principal, id: 'john@example.com' } }))
    .rejects.toThrow();
  await expect(issue({}, { principal: { ...principal, tokenVersion: 6 } }))
    .rejects.toThrow();
});

test.each([
  ['disabled', { enabled: false }],
  ['bad key ID', { keyId: '../../untrusted' }],
  ['HTTP issuer', { issuer: 'http://onecall-identity.invalid' }],
  ['issuer with path', { issuer: 'https://onecall-identity.invalid/callback' }],
  ['issuer with credentials', { issuer: 'https://alice:pass@onecall-identity.invalid' }],
  ['untrusted private key', { privateKeyPem: 'mobile-jwt-hs256-shared-secret' }],
])('%s issuer configuration fails closed', async (_label, changes) => {
  await expect(issue({}, { issuer: { ...config, ...changes } })).rejects.toThrow(
    'Dedicated OneCall identity assertion is unavailable',
  );
});

test('database lookup failure stops issuance', async () => {
  await expect(issueDedicatedAmboyIdentityAssertion({
    authenticatedPrincipal: principal,
    loadAuthoritativeUser: async () => { throw new Error('Database offline'); },
    config,
    nowSeconds: TIME,
  })).rejects.toThrow('Dedicated OneCall identity assertion is unavailable');
});

test('no live auth controller/module issues this assertion', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const root = __dirname;
  for (const filename of ['auth.controller.ts', 'auth.module.ts', 'auth.service.ts']) {
    expect(fs.readFileSync(path.join(root, filename), 'utf8'))
      .not.toContain('issueDedicatedAmboyIdentityAssertion');
  }
});
