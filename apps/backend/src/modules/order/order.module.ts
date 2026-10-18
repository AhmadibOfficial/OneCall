import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

import { OrderController } from './controllers/order.controller';
import { OrderRepository } from './repositories/order.repository';
import { OrderService } from './services/order.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrderController],
  providers: [JwtAuthGuard, OrderRepository, OrderService],
  exports: [OrderService],
})
export class OrderModule {}
