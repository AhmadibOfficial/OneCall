import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
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
  @Get('wallet')
  @Header('Cache-Control', 'no-store')
  wallet(@Req() r: AuthRequest) {
    return this.finance.wallet(r.user.id);
  }
  @Get('checkouts')
  @Header('Cache-Control', 'no-store')
  checkouts(@Req() r: AuthRequest) {
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
  @Get('return')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/html; charset=utf-8')
  returned() {
    // A browser redirect never verifies or settles a transaction.
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Return to OneCall</title><main><h1>Return to OneCall</h1><p>Return to your OneCall checkout and choose Check payment status. This page does not confirm a payment.</p><p>If you need help, contact OneCall Support with your checkout ID.</p></main></html>';
  }
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
