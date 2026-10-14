import {
  browserVerifier,
  openSocial,
  publicSocialBase,
  sealSocial,
} from './social-crypto';
describe('Browser sign-in secrets', () => {
  const secret = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'private-test-key-not-a-live-credential';
  });
  afterAll(() => {
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
  });
  it('encrypts result credentials and binds them to a single attempt', () => {
    const value = {
      accessToken: 'private-access',
      refreshToken: 'private-refresh',
    };
    const sealed = sealSocial(value, 'attempt-one');
    expect(sealed).not.toContain('private');
    expect(openSocial(sealed, 'attempt-one')).toEqual(value);
    expect(() => openSocial(sealed, 'attempt-two')).toThrow();
    const bytes = Buffer.from(sealed, 'base64url');
    bytes[30] ^= 1;
    expect(() =>
      openSocial(bytes.toString('base64url'), 'attempt-one'),
    ).toThrow();
  });
  it('PKCE verifiers are server-derived and differ between attempts', () => {
    expect(browserVerifier('one', 'hash')).toHaveLength(43);
    expect(browserVerifier('one', 'hash')).not.toEqual(
      browserVerifier('two', 'hash'),
    );
  });
  it('rejects insecure or credential-bearing public URLs', () => {
    const previous = process.env.ONECALL_SOCIAL_PUBLIC_API_URL;
    for (const url of [
      'http://localhost',
      'https://user:password@host.example',
      'https://host.example?token=x',
    ]) {
      process.env.ONECALL_SOCIAL_PUBLIC_API_URL = url;
      expect(publicSocialBase()).toBeNull();
    }
    if (previous === undefined)
      delete process.env.ONECALL_SOCIAL_PUBLIC_API_URL;
    else process.env.ONECALL_SOCIAL_PUBLIC_API_URL = previous;
  });
});
