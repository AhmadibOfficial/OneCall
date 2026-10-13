import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import { SocialVerifier } from './social-verifier';
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwt = new JwtService();
const publicJwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'test-key',
  alg: 'RS256',
  use: 'sig',
};
const original = { ...process.env };
const fetchOriginal = global.fetch;
function google(
  overrides: Record<string, unknown> = {},
  signingKey = privateKey,
) {
  return jwt.sign(
    {
      sub: 'provider-subject',
      email: 'person@gmail.com',
      email_verified: true,
      ...overrides,
    },
    {
      privateKey: signingKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString(),
      algorithm: 'RS256',
      keyid: 'test-key',
      issuer: 'https://accounts.google.com',
      audience: 'google-test-client',
      expiresIn: '5m',
    },
  );
}
describe('Social ID token verification: real RSA signatures, mocked HTTPS provider', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.ONECALL_SOCIAL_LOGIN_ENABLED = 'true';
    process.env.ONECALL_GOOGLE_CLIENT_ID = 'google-test-client';
    process.env.ONECALL_APPLE_CLIENT_ID = 'apple-test-client';
    process.env.ONECALL_APPLE_CLIENT_SECRET = 'test-client-secret';
    process.env.ONECALL_APPLE_TOKEN_KEY = Buffer.alloc(32, 7).toString(
      'base64',
    );
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 }),
      ),
    );
  });
  afterAll(() => {
    global.fetch = fetchOriginal;
    process.env = original;
  });
  it('accepts signature, issuer, audience, expiry and provider subject', async () => {
    await expect(
      new SocialVerifier().verify('google', google(), 'nonce'),
    ).resolves.toEqual({
      provider: 'google',
      subject: 'provider-subject',
      email: 'person@gmail.com',
      emailVerified: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/oauth2/v3/certs',
      expect.objectContaining({ redirect: 'error' }),
    );
  });
  it.each([
    { aud: 'foreign-client' },
    { iss: 'https://attacker.example' },
    { email_verified: false },
    { sub: '' },
    { email: 'bad' },
  ])('rejects invalid claims %j', async (claims) => {
    // Remove option-set claims from signing options to test exact invalid claims.
    const token = jwt.sign(
      {
        sub: 'provider-subject',
        email: 'person@gmail.com',
        email_verified: true,
        iss: 'https://accounts.google.com',
        aud: 'google-test-client',
        exp: Math.floor(Date.now() / 1000) + 300,
        ...claims,
      },
      {
        privateKey: privateKey
          .export({ type: 'pkcs8', format: 'pem' })
          .toString(),
        algorithm: 'RS256',
        keyid: 'test-key',
      },
    );
    await expect(
      new SocialVerifier().verify('google', token, 'nonce'),
    ).rejects.toThrow('Could not verify');
  });
  it('rejects a forged signature', async () => {
    const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await expect(
      new SocialVerifier().verify(
        'google',
        google({}, foreign.privateKey),
        'nonce',
      ),
    ).rejects.toThrow('Could not verify');
  });
  it('rejects expired tokens', async () => {
    const token = jwt.sign(
      { sub: 's', email: 'p@gmail.com', email_verified: true },
      {
        privateKey: privateKey
          .export({ type: 'pkcs8', format: 'pem' })
          .toString(),
        algorithm: 'RS256',
        keyid: 'test-key',
        issuer: 'https://accounts.google.com',
        audience: 'google-test-client',
        expiresIn: -60,
      },
    );
    await expect(
      new SocialVerifier().verify('google', token, 'nonce'),
    ).rejects.toThrow('Could not verify');
  });
  it('rejects HS256 algorithm substitution', async () => {
    await expect(
      new SocialVerifier().verify(
        'google',
        jwt.sign(
          { sub: 's' },
          { secret: 'attacker', algorithm: 'HS256', keyid: 'test-key' },
        ),
        'nonce',
      ),
    ).rejects.toThrow('Could not verify');
  });
  it('does not treat arbitrary third-party Google email as current email ownership', async () => {
    await expect(
      new SocialVerifier().verify(
        'google',
        google({ email: 'person@third-party.example' }),
        'nonce',
      ),
    ).resolves.toMatchObject({ emailVerified: false });
  });
  it('keeps production disabled pending provider lifecycle and native acceptance', () => {
    process.env.NODE_ENV = 'production';
    expect(new SocialVerifier().enabled('google')).toBe(false);
  });
  it('fails closed without configuration', async () => {
    delete process.env.ONECALL_GOOGLE_CLIENT_ID;
    await expect(
      new SocialVerifier().verify('google', google(), 'nonce'),
    ).rejects.toThrow('not configured');
  });
  it.each(['matching-nonce', 'wrong-nonce'])(
    'exchanges Apple code and validates nonce (%s)',
    async (nonce) => {
      const token = jwt.sign(
        {
          sub: 'apple-subject',
          email: 'relay@privaterelay.appleid.com',
          email_verified: 'true',
          nonce,
        },
        {
          privateKey: privateKey
            .export({ type: 'pkcs8', format: 'pem' })
            .toString(),
          algorithm: 'RS256',
          keyid: 'test-key',
          issuer: 'https://appleid.apple.com',
          audience: 'apple-test-client',
          expiresIn: '5m',
        },
      );
      global.fetch = jest.fn((url) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              (typeof url === 'string'
                ? url
                : url instanceof URL
                  ? url.href
                  : url.url
              ).endsWith('/token')
                ? { id_token: token, refresh_token: 'test-refresh-token' }
                : { keys: [publicJwk] },
            ),
          ),
        ),
      );
      const result = new SocialVerifier().verify(
        'apple',
        'untrusted-client-token',
        'matching-nonce',
        'single-use-code',
      );
      if (nonce === 'matching-nonce')
        await expect(result).resolves.toMatchObject({
          provider: 'apple',
          subject: 'apple-subject',
          emailVerified: true,
        });
      else await expect(result).rejects.toThrow('Could not verify');
    },
  );
  it('requires Apple single-use authorization code', async () => {
    await expect(
      new SocialVerifier().verify('apple', google(), 'nonce'),
    ).rejects.toThrow('Could not verify');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Apple signed lifecycle notices', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.ONECALL_SOCIAL_LOGIN_ENABLED = 'true';
    process.env.ONECALL_APPLE_CLIENT_ID = 'apple-test-client';
    process.env.ONECALL_APPLE_CLIENT_SECRET = 'test-secret';
    process.env.ONECALL_APPLE_TOKEN_KEY = Buffer.alloc(32, 7).toString(
      'base64',
    );
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ keys: [publicJwk] }))),
    );
  });
  afterAll(() => {
    global.fetch = fetchOriginal;
    process.env = original;
  });
  const notice = (extra: Record<string, unknown> = {}) =>
    jwt.sign(
      {
        jti: 'notice-1',
        events: {
          type: 'consent-revoked',
          sub: 'apple-person',
          event_time: Math.floor(Date.now() / 1000),
        },
        ...extra,
      },
      {
        privateKey: privateKey
          .export({ type: 'pkcs8', format: 'pem' })
          .toString(),
        algorithm: 'RS256',
        keyid: 'test-key',
        issuer: 'https://appleid.apple.com',
        audience: 'apple-test-client',
      },
    );
  it('verifies signed notices without requiring an expiry claim', async () => {
    await expect(new SocialVerifier().notice(notice())).resolves.toMatchObject({
      jti: 'notice-1',
      type: 'consent-revoked',
      subject: 'apple-person',
    });
  });
  it('rejects foreign audiences and malformed events', async () => {
    const wrong = jwt.sign(
      { jti: 'x', events: {} },
      {
        privateKey: privateKey
          .export({ type: 'pkcs8', format: 'pem' })
          .toString(),
        algorithm: 'RS256',
        keyid: 'test-key',
        issuer: 'https://appleid.apple.com',
        audience: 'foreign',
      },
    );
    await expect(new SocialVerifier().notice(wrong)).rejects.toThrow();
    await expect(
      new SocialVerifier().notice(notice({ events: [] })),
    ).rejects.toThrow();
  });
});
