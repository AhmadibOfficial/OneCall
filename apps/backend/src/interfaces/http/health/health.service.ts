import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
    };
  }
}
