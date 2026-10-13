import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, SocialIdentity } from '@prisma/client';
import { PrismaService } from '@/infrastructure/database/prisma';
import { SocialVerifier } from './social-verifier';
import { openApple } from './social-crypto';
@Injectable()
export class AppleLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: SocialVerifier,
  ) {}
  private async invalidate(
    identity: SocialIdentity,
    eventTime?: number,
    transaction?: Prisma.TransactionClient,
  ) {
    const mutate = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${identity.userId}::uuid FOR UPDATE`;
      const current = await tx.socialIdentity.findUnique({
        where: { id: identity.id },
      });
      if (
        !current ||
        current.appleRefreshEncrypted !== identity.appleRefreshEncrypted ||
        (eventTime !== undefined &&
          Math.floor(current.authorizedAt.getTime() / 1000) > eventTime)
      )
        return;
      await tx.socialIdentity.delete({ where: { id: identity.id } });
      await tx.user.update({
        where: { id: identity.userId },
        data: { tokenVersion: { increment: 1 } },
      });
      await tx.session.updateMany({
        where: { userId: identity.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.securityEvent.create({
        data: {
          userId: identity.userId,
          type: 'LOGOUT',
          metadata: { action: 'APPLE_CONSENT_REVOKED' },
        },
      });
    };
    return transaction ? mutate(transaction) : this.prisma.$transaction(mutate);
  }
  async notify(token: string) {
    const event = await this.verifier.notice(token);
    const id = createHash('sha256')
      .update('apple:' + event.jti)
      .digest('hex');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.appleNoticeReceipt.create({ data: { id } });
        if (
          ['consent-revoked', 'account-delete', 'account-deleted'].includes(
            event.type,
          )
        ) {
          const identity = await tx.socialIdentity.findUnique({
            where: {
              provider_subject: { provider: 'apple', subject: event.subject },
            },
          });
          if (identity) await this.invalidate(identity, event.time, tx);
        }
        return { processed: true };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return { processed: true, duplicate: true };
      throw error;
    }
  }
  async checkUser(userId: string) {
    const identity = await this.prisma.socialIdentity.findFirst({
      where: { userId, provider: 'apple' },
    });
    if (
      !identity ||
      (identity.lastCheckedAt &&
        Date.now() - identity.lastCheckedAt.getTime() < 86400000)
    )
      return;
    if (!identity.appleRefreshEncrypted || !identity.appleClientId)
      throw new ServiceUnavailableException(
        'Apple sign-in needs fresh authorization.',
      );
    const secret =
      identity.appleClientId === process.env.ONECALL_APPLE_CLIENT_ID
        ? process.env.ONECALL_APPLE_CLIENT_SECRET
        : identity.appleClientId === process.env.ONECALL_APPLE_WEB_CLIENT_ID
          ? process.env.ONECALL_APPLE_WEB_CLIENT_SECRET
          : undefined;
    if (!secret)
      throw new ServiceUnavailableException(
        'Apple sign-in configuration is unavailable.',
      );
    let token: string;
    try {
      token = openApple(identity.appleRefreshEncrypted, identity.subject);
    } catch {
      throw new ServiceUnavailableException(
        'Apple sign-in requires key recovery or reauthorization.',
      );
    }
    let response: Response;
    try {
      response = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: identity.appleClientId,
          client_secret: secret,
          grant_type: 'refresh_token',
          refresh_token: token,
        }),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Apple is temporarily unavailable. Retry later.',
      );
    }
    const data = (await response.json()) as {
      error?: string;
      access_token?: string;
    };
    if (response.status === 400 && data.error === 'invalid_grant') {
      await this.invalidate(identity);
      throw new UnauthorizedException(
        'Apple authorization was withdrawn. Sign in with another linked option.',
      );
    }
    if (!response.ok || !data.access_token)
      throw new ServiceUnavailableException(
        'Apple verification is temporarily unavailable.',
      );
    await this.prisma.socialIdentity.updateMany({
      where: {
        id: identity.id,
        appleRefreshEncrypted: identity.appleRefreshEncrypted,
      },
      data: { lastCheckedAt: new Date() },
    });
  }
  async checkDue() {
    const items = await this.prisma.socialIdentity.findMany({
      where: {
        provider: 'apple',
        OR: [
          { lastCheckedAt: null },
          { lastCheckedAt: { lt: new Date(Date.now() - 86400000) } },
        ],
      },
      select: { userId: true },
      take: 100,
    });
    const results = [];
    for (const item of items) {
      try {
        await this.checkUser(item.userId);
        results.push({ checked: true });
      } catch {
        results.push({ checked: false });
      }
    }
    return {
      checked: results.filter((x) => x.checked).length,
      failed: results.filter((x) => !x.checked).length,
    };
  }
}
