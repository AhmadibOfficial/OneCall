/**
 * P2-02b: OneCall's source-only, backend-side AMBOY identity assertion issuer.
 *
 * Intentionally NOT imported into a NestJS module or HTTP controller. No
 * endpoint exposes this. This is NOT a mobile JWT and cannot be created from
 * client-provided IDs, email, scopes or a tenant ID.
 *
 * A future narrowly scoped internal transport MUST independently validate
 * the authenticated OneCall principal, service peer, consent, rate budget and
 * current revocation state before calling this code.
 */
import {
  createPrivateKey,
  randomUUID,
  sign as signEd25519,
  type KeyObject,
} from 'node:crypto';

export const AMBOY_ASSERTION_AUDIENCE = 'metaautomate-amboy-identity-test';
export const AMBOY_ASSERTION_TYPE = 'onecall-amboy-identity+jwt';
export const AMBOY_ASSERTION_SCOPE = 'amboy:identity-test';
export const AMBOY_ASSERTION_TTL = 60;
const KID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type VerifiedMobilePrincipal = Readonly<{
  id: string;
  tokenVersion: number;
}>;

export type AuthoritativeIdentitySnapshot = Readonly<{
  id: string;
  status: string;
  tokenVersion: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  deletedAt: Date | null;
  lockedUntil: Date | null;
}>;

export type IdentityLookup = (
  subjectId: string,
) => Promise<AuthoritativeIdentitySnapshot | null>;

export type IssuerConfiguration = Readonly<{
  enabled: boolean;
  issuer: string;
  keyId: string;
  privateKeyPem: string;
}>;

function refused(): never {
  throw new Error('Dedicated OneCall identity assertion is unavailable');
}

function getKey(config: IssuerConfiguration): KeyObject {
  if (!config.enabled || !KID_PATTERN.test(config.keyId)) refused();
  let parsed: URL;
  try {
    parsed = new URL(config.issuer);
  } catch {
    return refused();
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    config.issuer.endsWith('/') ||
    config.issuer.length > 256
  ) refused();

  try {
    const key = createPrivateKey(config.privateKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') refused();
    return key;
  } catch {
    return refused();
  }
}

function segment(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export async function issueDedicatedAmboyIdentityAssertion(input: {
  authenticatedPrincipal: VerifiedMobilePrincipal;
  loadAuthoritativeUser: IdentityLookup;
  config: IssuerConfiguration;
  nowSeconds?: number;
}): Promise<string> {
  const { authenticatedPrincipal, loadAuthoritativeUser, config } = input;
  // Both keys and legitimate account state must exist before signing.
  const key = getKey(config);
  if (
    !authenticatedPrincipal ||
    !UUID4.test(authenticatedPrincipal.id) ||
    !Number.isSafeInteger(authenticatedPrincipal.tokenVersion) ||
    authenticatedPrincipal.tokenVersion < 0 ||
    typeof loadAuthoritativeUser !== 'function'
  ) refused();
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now <= 0) refused();

  let user: AuthoritativeIdentitySnapshot | null;
  try {
    user = await loadAuthoritativeUser(authenticatedPrincipal.id);
  } catch {
    return refused();
  }
  if (
    !user ||
    user.id !== authenticatedPrincipal.id ||
    user.status !== 'ACTIVE' ||
    user.deletedAt !== null ||
    user.tokenVersion !== authenticatedPrincipal.tokenVersion ||
    !Number.isSafeInteger(user.tokenVersion) ||
    !user.emailVerified ||
    !user.phoneVerified ||
    (user.lockedUntil && user.lockedUntil.getTime() > now * 1000)
  ) refused();

  const header = {
    alg: 'EdDSA',
    typ: AMBOY_ASSERTION_TYPE,
    kid: config.keyId,
  };
  const claims = {
    iss: config.issuer,
    aud: AMBOY_ASSERTION_AUDIENCE,
    sub: user.id,
    jti: randomUUID(),
    iat: now,
    nbf: now,
    exp: now + AMBOY_ASSERTION_TTL,
    product: 'onecall',
    scope: AMBOY_ASSERTION_SCOPE,
    token_version: user.tokenVersion,
    authority: 'onecall-backend',
  };

  const signingInput = segment(header) + '.' + segment(claims);
  const signature = signEd25519(null, Buffer.from(signingInput, 'ascii'), key);
  return signingInput + '.' + signature.toString('base64url');
}
