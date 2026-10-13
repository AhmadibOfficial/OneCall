import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { VerifiedAccountGuard } from '@/modules/auth/guards/verified-account.guard';
import { CheckoutDto, IdempotencyDto } from './marketplace.dto';
import { FinanceService } from './finance.service';
type AuthRequest = Request & { user: { id: string } };

@Controller()
@UseGuards(JwtAuthGuard, VerifiedAccountGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}
  @Get('wallet') wallet(@Req() r: AuthRequest) {
    return this.finance.wallet(r.user.id);
  }
  @Get('checkouts') checkouts(@Req() r: AuthRequest) {
    return this.finance.checkouts(r.user.id);
  }
  @Post('checkouts')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  checkout(@Req() r: AuthRequest, @Body() d: CheckoutDto) {
    return this.finance.checkout(r.user.id, d);
  }
  @Post('checkouts/:id/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verify(@Req() r: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.finance.verifyOwned(r.user.id, id);
  }
  @Post('orders/:id/pay-wallet')
  pay(
    @Req() r: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: IdempotencyDto,
  ) {
    return this.finance.payWallet(r.user.id, id, d.idempotencyKey);
  }
}
@Controller('payments/paystack')
export class PaystackWebhookController {
  constructor(private readonly finance: FinanceService) {}
  @Post('webhook')
  @SkipThrottle()
  webhook(
    @Req() r: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    return this.finance.webhook(r.rawBody, signature, body);
  }
}
