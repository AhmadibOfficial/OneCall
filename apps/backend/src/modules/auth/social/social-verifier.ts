import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { publicSocialBase, appleKeyReady, sealApple } from './social-crypto';
import { JwtService } from '@nestjs/jwt';
import { createPublicKey, type JsonWebKey } from 'node:crypto';
export type SocialProvider = 'google' | 'apple';
export type SocialClaims = {
  provider: SocialProvider;
  subject: string;
  email: string;
  emailVerified: boolean;
  appleRefreshEncrypted?: string;
  appleClientId?: string;
  authorizedAt?: number;
};
const PROVIDERS = {
  google: {
    keys: 'https://www.googleapis.com/oauth2/v3/certs',
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    variable: 'ONECALL_GOOGLE_CLIENT_ID',
  },
  apple: {
    keys: 'https://appleid.apple.com/auth/keys',
    issuer: ['https://appleid.apple.com'],
    variable: 'ONECALL_APPLE_CLIENT_ID',
  },
};
@Injectable()
export class SocialVerifier {
  private readonly cache = new Map<
    string,
    { keys: JsonWebKey[]; expires: number }
  >();
  private readonly jwt = new JwtService();
  enabled(provider: SocialProvider) {
    return (
      process.env.NODE_ENV !== 'production' &&
      process.env.ONECALL_SOCIAL_LOGIN_ENABLED === 'true' &&
      !!process.env[PROVIDERS[provider].variable]?.trim() &&
      (provider !== 'apple' ||
        (!!process.env.ONECALL_APPLE_CLIENT_SECRET?.trim() && appleKeyReady()))
    );
  }
  async verify(
    provider: SocialProvider,
    token: string,
    nonce: string,
    authorizationCode?: string,
    browser = false,
  ): Promise<SocialClaims> {
    if (!this.enabled(provider))
      throw new ServiceUnavailableException(
        'This sign-in option is not configured yet. Use email and password.',
      );
    const definition = PROVIDERS[provider];
    const clientId =
      browser && provider === 'apple'
        ? process.env.ONECALL_APPLE_WEB_CLIENT_ID
        : process.env[definition.variable];
    if (!clientId)
      throw new ServiceUnavailableException(
        'Sign-in configuration is incomplete.',
      );
    let refreshToken: string | undefined;
    try {
      if (provider === 'apple') {
        if (!authorizationCode) throw new Error();
        const response = await fetch('https://appleid.apple.com/auth/token', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId.trim(),
            client_secret: (browser
              ? process.env.ONECALL_APPLE_WEB_CLIENT_SECRET
              : process.env.ONECALL_APPLE_CLIENT_SECRET)!.trim(),
            grant_type: 'authorization_code',
            code: authorizationCode,
            ...(browser
              ? {
                  redirect_uri:
                    publicSocialBase()! + '/auth/social/callback/apple',
                }
              : {}),
          }),
        });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as {
          id_token?: string;
          refresh_token?: string;
        };
        if (typeof data.id_token !== 'string' || data.id_token.length > 8192)
          throw new Error();
        if (!data.refresh_token || data.refresh_token.length > 4096)
          throw new Error();
        refreshToken = data.refresh_token;
        token = data.id_token;
      }
      const payload = await this.validatedToken(
        provider,
        token,
        clientId.trim(),
      );
      if (
        typeof payload.exp !== 'number' ||
        typeof payload.iat !== 'number' ||
        payload.iat > Date.now() / 1000 + 30 ||
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        payload.sub.length > 255 ||
        typeof payload.email !== 'string' ||
        payload.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)
      )
        throw new Error();
      if ((provider === 'apple' || browser) && payload.nonce !== nonce)
        throw new Error();
      const verified =
        payload.email_verified === true || payload.email_verified === 'true';
      if (!verified) throw new Error();
      const email = payload.email.trim().normalize('NFC').toLowerCase();
      // Google is not authoritative for an arbitrary third-party email address.
      const emailVerified =
        provider === 'apple' ||
        email.endsWith('@gmail.com') ||
        (typeof payload.hd === 'string' && payload.hd.length > 0);
      return {
        provider,
        subject: payload.sub,
        email,
        emailVerified,
        ...(provider === 'apple'
          ? {
              appleRefreshEncrypted: sealApple(refreshToken!, payload.sub),
              appleClientId: clientId.trim(),
              authorizedAt: payload.iat,
            }
          : {}),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new UnauthorizedException(
        'Could not verify this sign-in. Please try again.',
      );
    }
  }
  private async validatedToken(
    provider: SocialProvider,
    token: string,
    audience: string | string[],
  ) {
    const definition = PROVIDERS[provider];
    const header = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString(),
    ) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid || header.kid.length > 200)
      throw new Error();
    let cached = this.cache.get(provider);
    if (!cached || cached.expires < Date.now()) {
      const response = await fetch(definition.keys, {
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok)
        throw new ServiceUnavailableException(
          'Sign-in provider is temporarily unavailable.',
        );
      const data = (await response.json()) as { keys: JsonWebKey[] };
      if (!Array.isArray(data.keys) || data.keys.length > 20) throw new Error();
      cached = { keys: data.keys, expires: Date.now() + 5 * 60 * 1000 };
      this.cache.set(provider, cached);
    }
    const key = cached.keys.find(
      (key) =>
        (key as JsonWebKey & { kid?: string }).kid === header.kid &&
        key.kty === 'RSA',
    );
    if (!key) throw new Error();
    const payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
      publicKey: createPublicKey({ key, format: 'jwk' })
        .export({ type: 'spki', format: 'pem' })
        .toString(),
      algorithms: ['RS256'],
      issuer: definition.issuer as [string, ...string[]],
      audience: audience as string | [string, ...string[]],
      clockTolerance: 30,
    });
    return payload;
  }
  async notice(token: string) {
    if (!this.enabled('apple'))
      throw new ServiceUnavailableException(
        'Apple notifications are not configured',
      );
    try {
      const audience = [
        process.env.ONECALL_APPLE_CLIENT_ID!,
        process.env.ONECALL_APPLE_WEB_CLIENT_ID,
      ].filter((v): v is string => !!v);
      const payload = await this.validatedToken('apple', token, audience);
      if (
        typeof payload.iat !== 'number' ||
        payload.iat > Date.now() / 1000 + 30 ||
        payload.iat < Date.now() / 1000 - 30 * 86400 ||
        typeof payload.jti !== 'string' ||
        !payload.jti ||
        payload.jti.length > 255
      )
        throw new Error();
      const raw =
        typeof payload.events === 'string'
          ? (JSON.parse(payload.events) as unknown)
          : payload.events;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error();
      const event = raw as Record<string, unknown>;
      if (
        typeof event.type !== 'string' ||
        typeof event.sub !== 'string' ||
        !event.sub ||
        event.sub.length > 255 ||
        typeof event.event_time !== 'number'
      )
        throw new Error();
      const time =
        event.event_time > 100000000000
          ? event.event_time / 1000
          : event.event_time;
      if (time <= 0 || time > Date.now() / 1000 + 30) throw new Error();
      return { jti: payload.jti, type: event.type, subject: event.sub, time };
    } catch {
      throw new UnauthorizedException('Invalid Apple notification');
    }
  }
}
