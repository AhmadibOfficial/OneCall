/**
 * P2-02c: backend-only M2M proof of possession for an AMBOY identity test.
 *
 * No endpoint, Nest provider, middleware, network request or customer trust is
 * enabled. This function first obtains a fresh OneCall identity assertion
 * under OneCall's authoritative account policy, then signs a separately
 * restricted M2M proof over the exact assertion bytes using a DIFFERENT key.
 */
import {
  createHash,
  createPrivateKey,
  randomUUID,
  sign,
} from 'node:crypto';
import {
  issueDedicatedAmboyIdentityAssertion,
  type IdentityLookup,
  type IssuerConfiguration,
  type VerifiedMobilePrincipal,
} from './amboy-identity-issuer';

export const SERVICE_PROOF_TYPE = 'onecall-amboy-service-proof+jwt';
export const SERVICE_PROOF_AUDIENCE = 'metaautomate-amboy-m2m-test';
export const SERVICE_PROOF_SCOPE = 'amboy:service-identity-test';
export const SERVICE_PROOF_PATH = '/internal/amboy/identity-test';
export const SERVICE_PROOF_TTL_SECONDS = 30;

export type ServiceProofConfig = Readonly<{
  enabled: boolean;
  issuer: string;
  keyId: string;
  privateKeyPem: string;
}>;

function reject(): never {
  throw new Error('OneCall M2M proof is unavailable');
}

function base64Json(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function proofKey(config: ServiceProofConfig) {
  if (!config?.enabled ||
      !/^oc-m2m-[a-zA-Z0-9_-]{8,64}$/.test(config.keyId) ||
      typeof config.issuer !== 'string' ||
      config.issuer.length > 256 ||
      !/^https:\/\/[a-zA-Z0-9.-]+(?::443)?$/.test(config.issuer)) reject();
  let key;
  try {
    key = createPrivateKey(config.privateKeyPem);
  } catch {
    return reject();
  }
  if (key.asymmetricKeyType !== 'ed25519') reject();
  return key;
}

export async function mintBoundOneCallServiceProof(input: {
  authenticatedPrincipal: VerifiedMobilePrincipal;
  loadAuthoritativeUser: IdentityLookup;
  identityIssuerConfig: IssuerConfiguration;
  serviceProofConfig: ServiceProofConfig;
  nowSeconds?: number;
}): Promise<Readonly<{ assertion: string; proof: string }>> {
  // Verify independent service key and identity issuer before any signing.
  const serviceKey = proofKey(input.serviceProofConfig);
  if (input.identityIssuerConfig.keyId === input.serviceProofConfig.keyId ||
      input.identityIssuerConfig.privateKeyPem === input.serviceProofConfig.privateKeyPem) reject();
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now <= 0) reject();

  // This issuer queries the authoritative user status and token version.
  // No client may choose an assertion, audience, tenant, operation or scope.
  const assertion = await issueDedicatedAmboyIdentityAssertion({
    authenticatedPrincipal: input.authenticatedPrincipal,
    loadAuthoritativeUser: input.loadAuthoritativeUser,
    config: input.identityIssuerConfig,
    nowSeconds: now,
  });
  const digest = createHash('sha256').update(assertion, 'ascii').digest('base64url');
  const protectedHeader = {
    alg: 'EdDSA', typ: SERVICE_PROOF_TYPE, kid: input.serviceProofConfig.keyId,
  };
  const payload = {
    iss: input.serviceProofConfig.issuer,
    aud: SERVICE_PROOF_AUDIENCE,
    sub: 'onecall-backend',
    jti: randomUUID(),
    iat: now, nbf: now, exp: now + SERVICE_PROOF_TTL_SECONDS,
    htm: 'POST', htu: SERVICE_PROOF_PATH,
    ath: digest,
    product: 'onecall', scope: SERVICE_PROOF_SCOPE,
  };
  const signingInput = base64Json(protectedHeader) + '.' + base64Json(payload);
  const signature = sign(null, Buffer.from(signingInput, 'ascii'), serviceKey);
  return Object.freeze({
    assertion,
    proof: signingInput + '.' + signature.toString('base64url'),
  });
}
