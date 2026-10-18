import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
export function sealSocial(value: unknown, id: string): string {
  const key = createHash('sha256')
    .update('onecall-social-browser-v1:' + process.env.JWT_SECRET!)
    .digest();
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(id));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64url');
}
export function openSocial(value: string, id: string): unknown {
  const bytes = Buffer.from(value, 'base64url');
  const key = createHash('sha256')
    .update('onecall-social-browser-v1:' + process.env.JWT_SECRET!)
    .digest();
  const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(id));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      cipher.update(bytes.subarray(28)),
      cipher.final(),
    ]).toString(),
  ) as unknown;
}
export function browserVerifier(id: string, hash: string) {
  return createHmac('sha256', process.env.JWT_SECRET!)
    .update('onecall-pkce:' + id + ':' + hash)
    .digest('base64url');
}
export function publicSocialBase() {
  const value = process.env.ONECALL_SOCIAL_PUBLIC_API_URL;
  if (!value) return null;
  const uri = new URL(value);
  if (
    uri.protocol !== 'https:' ||
    uri.username ||
    uri.password ||
    uri.search ||
    uri.hash
  )
    return null;
  return value.replace(/\/+$/, '');
}

export function appleKeyReady() {
  const value = process.env.ONECALL_APPLE_TOKEN_KEY ?? '';
  return (
    /^[A-Za-z0-9+/]{43}=$/.test(value) &&
    Buffer.from(value, 'base64').length === 32
  );
}
export function sealApple(refreshToken: string, subject: string) {
  if (!appleKeyReady()) throw new Error('Apple token key is not configured');
  const iv = randomBytes(12),
    cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.ONECALL_APPLE_TOKEN_KEY!, 'base64'),
      iv,
    );
  cipher.setAAD(Buffer.from(subject));
  const bytes = Buffer.concat([
    cipher.update(refreshToken, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64url');
}
export function openApple(value: string, subject: string) {
  if (!appleKeyReady()) throw new Error('Apple token key is not configured');
  const bytes = Buffer.from(value, 'base64url'),
    cipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.ONECALL_APPLE_TOKEN_KEY!, 'base64'),
      bytes.subarray(0, 12),
    );
  cipher.setAAD(Buffer.from(subject));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    cipher.update(bytes.subarray(28)),
    cipher.final(),
  ]).toString('utf8');
}
