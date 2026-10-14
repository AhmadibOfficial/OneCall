import { UploadModule } from '../modules/upload/upload.module';

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { configuration, validationSchema } from '../config';
import { PrismaModule } from '../infrastructure/database/prisma';
import { HealthController } from '../interfaces/http/health/health.controller';
import { HealthService } from '../interfaces/http/health/health.service';
import { AuthModule } from '../modules/auth/auth.module';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

import { OrderModule } from '@/modules/order/order.module';

import { PaymentModule } from '@/modules/payment/payment.module';
import { ServicesModule } from '@/modules/services/services.module';
import { MarketplaceModule } from '@/modules/marketplace/marketplace.module';
import { AdminModule } from '@/modules/admin/admin.module';

@Module({
  imports: [
    UploadModule,
    ServicesModule,
    MarketplaceModule,
    AdminModule,
    PaymentModule,
    OrderModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            limit: Number(config.get('THROTTLE_GLOBAL_LIMIT') ?? 100),
            ttl: Number(config.get('THROTTLE_GLOBAL_TTL_MS') ?? 60000),
          },
        ],
        storage: new ThrottlerStorageRedisService(
          config.getOrThrow<string>('REDIS_URL'),
          { keyPrefix: config.getOrThrow<string>('THROTTLE_KEY_PREFIX') },
        ),
      }),
    }),

    AuthModule,
    ConfigModule.forRoot({
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      isGlobal: true,
      load: [configuration],
      validationSchema,
      expandVariables: true,
    }),

    PrismaModule,
  ],

  controllers: [HealthController],

  providers: [HealthService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
