import { Prisma } from '@prisma/client';

import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PaymentWebhookSignatureService } from './payment-webhook-signature.service';
import { PaymentWebhookRepository } from './payment-webhook.repository';
import { PaymentWebhookPayload } from './payment-webhook.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EVENT_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

const PROVIDER_REFERENCE_RE = /^[A-Za-z0-9._:-]{1,255}$/;

const AMOUNT_RE = /^\d{1,10}(?:\.\d{1,2})?$/;

const CURRENCY_RE = /^[A-Z]{3}$/;

const EVENT_TYPES = new Set([
  'payment.pending',
  'payment.succeeded',
  'payment.failed',
  'payment.refunded',
]);

@Injectable()
export class PaymentWebhookService {
  constructor(
    private readonly signatureService: PaymentWebhookSignatureService,
    private readonly repository: PaymentWebhookRepository,
  ) {}

  async handle(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    body: unknown,
    eventIdHeader?: string,
  ) {
    this.signatureService.verify(rawBody, signatureHeader);

    const payload = this.validatePayload(body);

    if (eventIdHeader !== undefined && eventIdHeader !== payload.eventId) {
      throw new BadRequestException('Webhook event identifier mismatch');
    }

    const payloadHash = createHash('sha256').update(rawBody).digest('hex');

    const existing = await this.repository.findEvent(payload.eventId);

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new ConflictException('Webhook event identifier reuse detected');
      }

      return {
        received: true,
        duplicate: true,
      };
    }

    try {
      const result = await this.repository.processEvent(
        payload,
        payloadHash,
        new Date(),
      );

      return {
        received: true,
        duplicate: result.duplicate,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const raceWinner = await this.repository.findEvent(payload.eventId);

        if (raceWinner && raceWinner.payloadHash === payloadHash) {
          return {
            received: true,
            duplicate: true,
          };
        }

        if (raceWinner) {
          throw new ConflictException(
            'Webhook event identifier reuse detected',
          );
        }

        throw new ConflictException(
          'Webhook event conflicts with existing payment state',
        );
      }

      throw error;
    }
  }

  private validatePayload(body: unknown): PaymentWebhookPayload {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Invalid webhook payload');
    }

    const value = body as Record<string, unknown>;

    if (
      !Object.prototype.hasOwnProperty.call(value, 'eventId') ||
      !Object.prototype.hasOwnProperty.call(value, 'type') ||
      !Object.prototype.hasOwnProperty.call(value, 'data')
    ) {
      throw new BadRequestException('Invalid webhook payload');
    }

    if (typeof value.eventId !== 'string' || !EVENT_ID_RE.test(value.eventId)) {
      throw new BadRequestException('Invalid webhook payload');
    }

    if (typeof value.type !== 'string' || !EVENT_TYPES.has(value.type)) {
      throw new BadRequestException('Invalid webhook payload');
    }

    if (
      value.data === null ||
      typeof value.data !== 'object' ||
      Array.isArray(value.data)
    ) {
      throw new BadRequestException('Invalid webhook payload');
    }

    const data = value.data as Record<string, unknown>;

    if (typeof data.paymentId !== 'string' || !UUID_RE.test(data.paymentId)) {
      throw new BadRequestException('Invalid webhook payload');
    }

    if (
      typeof data.providerReference !== 'string' ||
      !PROVIDER_REFERENCE_RE.test(data.providerReference)
    ) {
      throw new BadRequestException('Invalid webhook payload');
    }

    if (typeof data.amount !== 'string' || !AMOUNT_RE.test(data.amount)) {
      throw new BadRequestException('Invalid webhook payload');
    }

    if (typeof data.currency !== 'string' || !CURRENCY_RE.test(data.currency)) {
      throw new BadRequestException('Invalid webhook payload');
    }

    return {
      eventId: value.eventId,
      type: value.type as PaymentWebhookPayload['type'],
      data: {
        paymentId: data.paymentId,
        providerReference: data.providerReference,
        amount: data.amount,
        currency: data.currency,
      },
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
