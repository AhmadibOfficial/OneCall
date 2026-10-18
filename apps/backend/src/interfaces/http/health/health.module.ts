import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../infrastructure/database/prisma';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}