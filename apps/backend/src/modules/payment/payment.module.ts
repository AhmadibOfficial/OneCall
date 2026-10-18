import { Module } from '@nestjs/common';

import {
  PaymentWebhookController,
} from './webhook/payment-webhook.controller';

import {
  PaymentWebhookRepository,
} from './webhook/payment-webhook.repository';

import {
  PaymentWebhookService,
} from './webhook/payment-webhook.service';

import {
  PaymentWebhookSignatureService,
} from './webhook/payment-webhook-signature.service';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

import { PaymentController } from './controllers/payment.controller';
import { PaymentRepository } from './repositories/payment.repository';
import { PaymentService } from './services/payment.service';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentController, PaymentWebhookController],
  providers: [
    JwtAuthGuard,
    PaymentRepository,
    PaymentService,
    PaymentWebhookRepository,
    PaymentWebhookService,
    {
      provide: PaymentWebhookSignatureService,
      useFactory: () => new PaymentWebhookSignatureService(),
    },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
