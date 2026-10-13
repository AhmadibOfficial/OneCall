import { Injectable } from '@nestjs/common';
import { PasswordResetToken } from '@prisma/client';

import { PrismaService } from '@/infrastructure/database/prisma';

@Injectable()
export class PasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: string,
    selector: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.create({
      data: {
        userId,
        selector,
        tokenHash,
        expiresAt,
      },
    });
  }

  findBySelector(
    selector: string,
  ): Promise<PasswordResetToken | null> {
    return this.prisma.passwordResetToken.findUnique({
      where: { selector },
    });
  }

  consume(id: string): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.update({
      where: { id },
      data: {
        consumedAt: new Date(),
      },
    });
  }

  consumeAllForUser(userId: string) {
    return this.prisma.passwordResetToken.updateMany({
      where: {
        userId,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });
  }

  deleteExpired() {
    return this.prisma.passwordResetToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }
}
