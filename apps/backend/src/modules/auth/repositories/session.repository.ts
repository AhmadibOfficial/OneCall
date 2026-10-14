import { Injectable } from '@nestjs/common';
import { Session } from '@prisma/client';

import { PrismaService } from '@/infrastructure/database/prisma';

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: string,
    selector: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<Session> {
    return this.prisma.session.create({
      data: {
        userId,
        selector,
        tokenHash,
        expiresAt,
      },
    });
  }

  findBySelector(selector: string): Promise<Session | null> {
    return this.prisma.session.findUnique({
      where: { selector },
    });
  }

  revoke(sessionId: string): Promise<Session> {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  revokeAllForUser(userId: string) {
    return this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
