import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/database/prisma';
import { AuthService } from '../auth.service';
import { assertAccountAvailable } from '../account-policy';
import {
  SocialVerifier,
  type SocialClaims,
  type SocialProvider,
} from './social-verifier';
import {
  SocialExchangeDto,
  SocialCompleteDto,
  SocialUnlinkDto,
} from './social.dto';
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: SocialVerifier,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}
  async linked(userId: string) {
    return this.prisma.socialIdentity.findMany({
      where: { userId },
      select: { provider: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  async unlink(userId: string, data: SocialUnlinkDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      assertAccountAvailable(user);
      // Fresh password proof confirms a usable alternative sign-in method.
      // A social-only account must set a password through verified recovery first.
      if (
        !user ||
        (user.lockedUntil && user.lockedUntil > new Date()) ||
        !(await argon2.verify(user.passwordHash, data.password))
      )
        throw new ForbiddenException(
          'Confirm your OneCall password. If you have not set one, use password reset first.',
        );
      const removed = await tx.socialIdentity.deleteMany({
        where: { userId, provider: data.provider },
      });
      if (removed.count !== 1)
        throw new ConflictException(
          'This sign-in option is not linked to your account.',
        );
      await tx.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.securityEvent.create({
        data: {
          userId,
          type: 'LOGOUT',
          metadata: {
            action: 'SOCIAL_IDENTITY_UNLINKED',
            provider: data.provider,
          },
        },
      });
      return { unlinked: true, sessionsRevoked: true };
    });
  }
  configuration() {
    return {
      google: this.verifier.enabled('google'),
      apple: this.verifier.enabled('apple'),
    };
  }
  async begin(
    provider: SocialProvider,
    browser = false,
    binding?: { id: string; tokenVersion: number },
  ) {
    if (!this.verifier.enabled(provider))
      throw new ServiceUnavailableException(
        'This sign-in option is not configured yet. Use email and password.',
      );
    const secret = randomBytes(32).toString('hex');
    const nonce = randomBytes(32).toString('hex');
    // Opportunistic retention: expired challenges contain no provider token or PII.
    await this.prisma.socialAuthChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const challenge = await this.prisma.socialAuthChallenge.create({
      data: {
        provider,
        browser,
        bindingUserId: binding?.id,
        bindingVersion: binding?.tokenVersion,
        secretHash: digest(secret),
        nonce,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    return { challenge: `${challenge.id}.${secret}`, nonce, expiresIn: 300 };
  }
  private async verifyChallenge(data: SocialExchangeDto) {
    const parsed =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/.exec(
        data.challenge,
      );
    if (!parsed)
      throw new UnauthorizedException('Sign-in attempt expired. Try again.');
    const challenge = await this.prisma.socialAuthChallenge.findUnique({
      where: { id: parsed[1] },
    });
    if (
      !challenge ||
      challenge.browser ||
      challenge.provider !== data.provider ||
      challenge.verifiedAt ||
      challenge.expiresAt <= new Date() ||
      !timingSafeEqual(
        Buffer.from(challenge.secretHash, 'hex'),
        Buffer.from(digest(parsed[2]), 'hex'),
      )
    )
      throw new UnauthorizedException('Sign-in attempt expired. Try again.');
    const identity = await this.verifier.verify(
      data.provider,
      data.idToken,
      challenge.nonce,
      data.authorizationCode,
    );
    const claimed = await this.prisma.socialAuthChallenge.updateMany({
      where: {
        id: challenge.id,
        verifiedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { verifiedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new UnauthorizedException('Sign-in attempt expired. Try again.');
    return { id: challenge.id, identity };
  }
  async exchange(data: SocialExchangeDto) {
    const { id, identity } = await this.verifyChallenge(data);
    return this.finishExchange(id, identity);
  }
  async finishExchange(id: string, identity: SocialClaims) {
    const existing = await this.prisma.socialIdentity.findUnique({
      where: {
        provider_subject: {
          provider: identity.provider,
          subject: identity.subject,
        },
      },
    });
    if (existing)
      return this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${existing.userId}::uuid FOR UPDATE`;
        const linked = await tx.socialIdentity.findUnique({
          where: { id: existing.id },
        });
        if (!linked)
          throw new UnauthorizedException(
            'Sign-in link was removed. Try another option.',
          );
        await this.claimCompletion(tx, id);
        if (identity.provider === 'apple')
          await tx.socialIdentity.update({
            where: { id: existing.id },
            data: {
              appleRefreshEncrypted: identity.appleRefreshEncrypted,
              appleClientId: identity.appleClientId,
              authorizedAt: new Date(identity.authorizedAt! * 1000),
              lastCheckedAt: new Date(),
            },
          });
        return this.auth.socialSession(tx, existing.userId);
      });
    // Never infer account ownership from an email claim, even if verified.
    if (
      await this.prisma.user.findUnique({
        where: { email: identity.email },
        select: { id: true },
      })
    )
      throw new ConflictException(
        'An account already uses this email. Sign in with your password, then link this option from Profile.',
      );
    const ticket = await this.jwt.signAsync(
      { purpose: 'social-signup', challengeId: id, identity },
      {
        issuer: 'onecall',
        audience: 'onecall-social-signup',
        expiresIn: '5m',
        algorithm: 'HS256',
      },
    );
    return { profileRequired: true, ticket };
  }
  private async claimCompletion(tx: Prisma.TransactionClient, id: string) {
    const claimed = await tx.socialAuthChallenge.updateMany({
      where: {
        id,
        verifiedAt: { not: null },
        completedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { completedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new UnauthorizedException('Sign-in attempt expired. Try again.');
  }
  async complete(data: SocialCompleteDto) {
    let payload: {
      purpose: string;
      challengeId: string;
      identity: SocialClaims;
    };
    try {
      payload = await this.jwt.verifyAsync(data.ticket, {
        issuer: 'onecall',
        audience: 'onecall-social-signup',
        algorithms: ['HS256'],
      });
      if (
        payload.purpose !== 'social-signup' ||
        !payload.identity ||
        !['google', 'apple'].includes(payload.identity.provider)
      )
        throw new Error();
    } catch {
      throw new UnauthorizedException('Sign-in attempt expired. Try again.');
    }
    if (!data.firstName.trim() || !data.lastName.trim())
      throw new ConflictException('Enter your first and last names.');
    const passwordHash = await argon2.hash(randomBytes(48).toString('hex'));
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.claimCompletion(tx, payload.challengeId);
        const { provider, subject, email, emailVerified } = payload.identity;
        const user = await tx.user.create({
          data: {
            uid: randomInt(1000000000, 10000000000).toString(),
            email,
            phone: data.phone,
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            passwordHash,
            status: 'ACTIVE',
            emailVerified,
            emailVerifiedAt: emailVerified ? new Date() : null,
            socialIdentities: {
              create: {
                provider,
                subject,
                appleRefreshEncrypted: payload.identity.appleRefreshEncrypted,
                appleClientId: payload.identity.appleClientId,
                authorizedAt: payload.identity.authorizedAt
                  ? new Date(payload.identity.authorizedAt * 1000)
                  : new Date(),
                lastCheckedAt: provider === 'apple' ? new Date() : null,
              },
            },
          },
        });
        return this.auth.socialSession(tx, user.id);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'An account already uses these details. Sign in to your existing account.',
        );
      throw error;
    }
  }
  async link(userId: string, data: SocialExchangeDto) {
    const { id, identity } = await this.verifyChallenge(data);
    return this.linkVerified(userId, id, identity);
  }
  async linkVerified(
    userId: string,
    id: string,
    identity: SocialClaims,
    expectedVersion?: number,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId } });
        assertAccountAvailable(user);
        if (
          expectedVersion !== undefined &&
          user?.tokenVersion !== expectedVersion
        )
          throw new UnauthorizedException('Sign in again before linking.');
        if (user?.lockedUntil && user.lockedUntil > new Date())
          throw new UnauthorizedException('Account is not available');
        await this.claimCompletion(tx, id);
        await tx.socialIdentity.create({
          data: {
            userId,
            provider: identity.provider,
            subject: identity.subject,
            appleRefreshEncrypted: identity.appleRefreshEncrypted,
            appleClientId: identity.appleClientId,
            authorizedAt: identity.authorizedAt
              ? new Date(identity.authorizedAt * 1000)
              : new Date(),
            lastCheckedAt: identity.provider === 'apple' ? new Date() : null,
          },
        });
        // Do not change account email, phone, verification, roles or provider approval.
        await tx.securityEvent.create({
          data: {
            userId,
            type: 'LOGIN_SUCCESS',
            metadata: {
              action: 'SOCIAL_IDENTITY_LINKED',
              provider: identity.provider,
            },
          },
        });
        return { linked: true, provider: identity.provider };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('This sign-in option is already linked.');
      throw error;
    }
  }
}
