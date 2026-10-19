import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { PaymentWebhookService } from './payment-webhook.service';

@Controller('payments')
export class PaymentWebhookController {
  constructor(private readonly webhookService: PaymentWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(@Req() request: RawBodyRequest<Request>) {
    const rawBody =
      request.rawBody ??
      (Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0));

    if (rawBody.length === 0) {
      throw new BadRequestException('Invalid webhook body');
    }

    let payload: unknown;

    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid webhook JSON');
    }

    return this.webhookService.handle(
      rawBody,
      request.header('x-onecall-signature'),
      payload,
      request.header('x-onecall-event-id') ?? undefined,
    );
  }
}
