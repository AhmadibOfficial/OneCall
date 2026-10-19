import { Injectable } from '@nestjs/common';
import { VerificationToken, VerificationTokenType } from '@prisma/client';

import { PrismaService } from '@/infrastructure/database/prisma';

@Injectable()
export class VerificationTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: string,
    selector: string,
    tokenHash: string,
    type: VerificationTokenType,
    expiresAt: Date,
  ): Promise<VerificationToken> {
    return this.prisma.verificationToken.create({
      data: {
        userId,
        selector,
        tokenHash,
        type,
        expiresAt,
      },
    });
  }

  findBySelector(selector: string): Promise<VerificationToken | null> {
    return this.prisma.verificationToken.findUnique({
      where: { selector },
    });
  }

  consume(id: string): Promise<VerificationToken> {
    return this.prisma.verificationToken.update({
      where: { id },
      data: {
        consumedAt: new Date(),
      },
    });
  }

  consumeAllForUser(
    userId: string,
    type: VerificationTokenType,
  ) {
    return this.prisma.verificationToken.updateMany({
      where: {
        userId,
        type,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });
  }

  /**
   * Atomically consume a verification token exactly once.
   *
   * Passing a transaction client keeps the token claim and the
   * associated user verification inside the same DB transaction.
   */
  consumeIfUnused(
    id: string,
    client: Pick<PrismaService, 'verificationToken'> = this.prisma,
  ) {
    return client.verificationToken.updateMany({
      where: {
        id,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });
  }

  deleteExpired() {
    return this.prisma.verificationToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }
}
