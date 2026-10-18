import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '@/infrastructure/database/prisma';
import { SocialService } from './social.service';
import { SocialVerifier, SocialProvider } from './social-verifier';
import {
  browserVerifier,
  openSocial,
  publicSocialBase,
  sealSocial,
} from './social-crypto';
@Injectable()
export class SocialBrowserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly social: SocialService,
    private readonly verifier: SocialVerifier,
  ) {}
  enabled(provider: SocialProvider) {
    try {
      return (
        this.verifier.enabled(provider) &&
        !!publicSocialBase() &&
        (provider === 'google'
          ? !!process.env.ONECALL_GOOGLE_CLIENT_SECRET
          : !!process.env.ONECALL_APPLE_WEB_CLIENT_ID &&
            !!process.env.ONECALL_APPLE_WEB_CLIENT_SECRET)
      );
    } catch {
      return false;
    }
  }
  async begin(
    provider: SocialProvider,
    binding?: { id: string; tokenVersion: number },
  ) {
    if (!this.enabled(provider))
      throw new ServiceUnavailableException(
        'Browser sign-in is not configured yet. Use email and password.',
      );
    const attempt = await this.social.begin(provider, true, binding);
    const id = attempt.challenge.split('.')[0];
    const stored = await this.prisma.socialAuthChallenge.findUniqueOrThrow({
      where: { id },
    });
    const redirect = publicSocialBase()! + '/auth/social/callback/' + provider;
    const params = new URLSearchParams({
      client_id:
        provider === 'google'
          ? process.env.ONECALL_GOOGLE_CLIENT_ID!
          : process.env.ONECALL_APPLE_WEB_CLIENT_ID!,
      redirect_uri: redirect,
      response_type: 'code',
      scope: provider === 'google' ? 'openid email profile' : 'name email',
      state: id,
      nonce: attempt.nonce,
    });
    if (provider === 'google') {
      params.set(
        'code_challenge',
        createHash('sha256')
          .update(browserVerifier(id, stored.secretHash))
          .digest('base64url'),
      );
      params.set('code_challenge_method', 'S256');
    } else params.set('response_mode', 'form_post');
    return {
      ...attempt,
      authorizationUrl:
        (provider === 'google'
          ? 'https://accounts.google.com/o/oauth2/v2/auth?'
          : 'https://appleid.apple.com/auth/authorize?') + params.toString(),
    };
  }
  async callback(
    provider: SocialProvider,
    state: unknown,
    code: unknown,
    error: unknown,
  ) {
    if (
      typeof state !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        state,
      )
    )
      throw new UnauthorizedException('Sign-in attempt is unavailable');
    const attempt = await this.prisma.socialAuthChallenge.findUnique({
      where: { id: state },
    });
    if (
      !attempt ||
      !attempt.browser ||
      attempt.provider !== provider ||
      attempt.expiresAt <= new Date() ||
      !this.enabled(provider)
    )
      throw new UnauthorizedException('Sign-in attempt is unavailable');
    const claimed = await this.prisma.socialAuthChallenge.updateMany({
      where: { id: state, verifiedAt: null, expiresAt: { gt: new Date() } },
      data: { verifiedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new UnauthorizedException('Sign-in attempt already handled');
    let result: unknown;
    try {
      if (error || typeof code !== 'string' || !code || code.length > 4096)
        throw new Error();
      let token = 'unused-client-token';
      if (provider === 'google') {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.ONECALL_GOOGLE_CLIENT_ID!,
            client_secret: process.env.ONECALL_GOOGLE_CLIENT_SECRET!,
            redirect_uri: publicSocialBase()! + '/auth/social/callback/google',
            grant_type: 'authorization_code',
            code,
            code_verifier: browserVerifier(attempt.id, attempt.secretHash),
          }),
        });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as { id_token?: string };
        if (!data.id_token || data.id_token.length > 8192) throw new Error();
        token = data.id_token;
      }
      const identity = await this.verifier.verify(
        provider,
        token,
        attempt.nonce,
        provider === 'apple' ? code : undefined,
        true,
      );
      result = attempt.bindingUserId
        ? await this.social.linkVerified(
            attempt.bindingUserId,
            attempt.id,
            identity,
            attempt.bindingVersion ?? undefined,
          )
        : await this.social.finishExchange(attempt.id, identity);
    } catch {
      result = {
        error: 'Sign-in could not complete. Return to OneCall and try again.',
      };
    }
    await this.prisma.socialAuthChallenge.update({
      where: { id: state },
      data: { resultEncrypted: sealSocial(result, state) },
    });
    return 'Sign-in processed. Return to the OneCall app or browser tab to continue. No account credentials are shown here.';
  }
  async result(value: string) {
    const parsed =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/.exec(
        value,
      );
    if (!parsed) throw new UnauthorizedException('Sign-in attempt expired');
    const attempt = await this.prisma.socialAuthChallenge.findUnique({
      where: { id: parsed[1] },
    });
    const hash = createHash('sha256').update(parsed[2]).digest();
    if (
      !attempt ||
      !attempt.browser ||
      attempt.expiresAt <= new Date() ||
      !timingSafeEqual(Buffer.from(attempt.secretHash, 'hex'), hash) ||
      attempt.deliveredAt
    )
      throw new UnauthorizedException('Sign-in attempt expired');
    if (!attempt.resultEncrypted) return { pending: true };
    const claimed = await this.prisma.socialAuthChallenge.updateMany({
      where: { id: attempt.id, deliveredAt: null },
      data: { deliveredAt: new Date(), resultEncrypted: null },
    });
    if (claimed.count !== 1)
      throw new UnauthorizedException('Sign-in result already collected');
    return openSocial(attempt.resultEncrypted, attempt.id);
  }
}
