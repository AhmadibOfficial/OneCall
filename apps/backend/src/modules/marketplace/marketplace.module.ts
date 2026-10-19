import { Module } from '@nestjs/common';
import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import {
  AccountFeaturesController,
  BookingFeaturesController,
} from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import {
  FinanceController,
  PaystackWebhookController,
} from './finance.controller';
import { FinanceService } from './finance.service';
import { PaystackGateway } from './paystack.gateway';
@Module({
  imports: [PrismaModule],
  controllers: [
    AccountFeaturesController,
    BookingFeaturesController,
    FinanceController,
    PaystackWebhookController,
  ],
  providers: [
    JwtAuthGuard,
    MarketplaceService,
    FinanceService,
    PaystackGateway,
  ],
})
export class MarketplaceModule {}
