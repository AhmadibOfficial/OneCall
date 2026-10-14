import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import {
  mintBoundOneCallServiceProof,
  SERVICE_PROOF_AUDIENCE,
  SERVICE_PROOF_PATH,
  SERVICE_PROOF_SCOPE,
  SERVICE_PROOF_TTL_SECONDS,
  SERVICE_PROOF_TYPE,
} from './amboy-service-proof';

const SUBJECT = 'a53a56c0-0c2d-45ef-8e98-1450cd38b923';
const NOW = 1790000000;
const identityKeys = generateKeyPairSync('ed25519');
const serviceKeys = generateKeyPairSync('ed25519');
const issuer = {
  enabled: true,
  issuer: 'https://onecall-identity.invalid',
  keyId: 'onecall-test-key-2026',
  privateKeyPem: identityKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const m2m = {
  enabled: true,
  issuer: 'https://onecall-service.invalid',
  keyId: 'oc-m2m-staging2026',
  privateKeyPem: serviceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const subject = {
  id: SUBJECT,
  status: 'ACTIVE',
  tokenVersion: 2,
  emailVerified: true,
  phoneVerified: true,
  deletedAt: null,
  lockedUntil: null,
};
const issue = (override: Record<string, unknown> = {}, serviceConfig = m2m) =>
  mintBoundOneCallServiceProof({
    authenticatedPrincipal: { id: SUBJECT, tokenVersion: 2 },
    loadAuthoritativeUser: async () => ({ ...subject, ...override }),
    identityIssuerConfig: issuer,
    serviceProofConfig: serviceConfig,
    nowSeconds: NOW,
  });

test('M2M proof independently signed, scoped, time-limited and bound to assertion bytes', async () => {
  const { assertion, proof } = await issue();
  const [h, p, s] = proof.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const body = JSON.parse(Buffer.from(p, 'base64url').toString());
  expect(header).toEqual({ alg: 'EdDSA', typ: SERVICE_PROOF_TYPE, kid: m2m.keyId });
  expect(Object.keys(body).sort()).toEqual([
    'ath','aud','exp','htm','htu','iat','iss','jti','nbf','product','scope','sub',
  ]);
  expect(body).toMatchObject({
    iss: m2m.issuer, aud: SERVICE_PROOF_AUDIENCE, sub: 'onecall-backend',
    htm: 'POST', htu: SERVICE_PROOF_PATH, product: 'onecall',
    scope: SERVICE_PROOF_SCOPE, iat: NOW, nbf: NOW,
    exp: NOW + SERVICE_PROOF_TTL_SECONDS,
    ath: createHash('sha256').update(assertion, 'ascii').digest('base64url'),
  });
  expect(verify(null, Buffer.from(h + '.' + p, 'ascii'), serviceKeys.publicKey,
    Buffer.from(s, 'base64url'))).toBe(true);
  expect(verify(null, Buffer.from(h + '.' + p, 'ascii'), identityKeys.publicKey,
    Buffer.from(s, 'base64url'))).toBe(false);
  const again = await issue();
  expect(again.proof).not.toBe(proof);
  expect(again.assertion).not.toBe(assertion);
});

test.each([
  ['blocked', { status: 'BLOCKED' }],
  ['revoked', { tokenVersion: 3 }],
  ['deleted', { deletedAt: new Date() }],
  ['unverified', { emailVerified: false }],
  ['no phone verification', { phoneVerified: false }],
])('%s OneCall account cannot obtain a service proof', async (_name, status) => {
  await expect(issue(status)).rejects.toThrow();
});

test.each([
  ['disabled', { enabled: false }],
  ['bad key id', { keyId: '../../bad' }],
  ['wrong issuer', { issuer: 'http://onecall-service.invalid' }],
  ['issuer path injection', { issuer: 'https://onecall-service.invalid/else' }],
  ['HS256 key', { privateKeyPem: 'mobile_jwt_shared_secret' }],
])('%s service proof configuration rejected', async (_name, change) => {
  await expect(issue({}, { ...m2m, ...change })).rejects.toThrow(
    'OneCall M2M proof is unavailable',
  );
});

test('identity key reuse is prohibited', async () => {
  await expect(issue({}, { ...m2m, privateKeyPem: issuer.privateKeyPem }))
    .rejects.toThrow();
  await expect(issue({}, { ...m2m, keyId: issuer.keyId }))
    .rejects.toThrow();
});

test('no live backend module/controller imports M2M signing', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  for (const file of ['auth.module.ts', 'auth.controller.ts', 'auth.service.ts']) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    expect(source).not.toContain('mintBoundOneCallServiceProof');
  }
});
