import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service';
import {
  PAYMENT_WEBHOOK_TRANSITIONS,
  PaymentWebhookPayload,
} from './payment-webhook.types';

@Injectable()
export class PaymentWebhookRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findEvent(eventId: string) {
    return this.prisma.paymentWebhookEvent.findUnique({
      where: { eventId },
      select: {
        id: true,
        eventId: true,
        payloadHash: true,
        paymentId: true,
        processedAt: true,
      },
    });
  }

  async processEvent(
    payload: PaymentWebhookPayload,
    payloadHash: string,
    receivedAt: Date,
  ) {
    const transition = PAYMENT_WEBHOOK_TRANSITIONS[payload.type];

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Serialize deliveries for one payment, then recheck idempotency inside the lock.
      await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${payload.data.paymentId}::uuid FOR UPDATE`;
      const existing = await tx.paymentWebhookEvent.findUnique({
        where: { eventId: payload.eventId },
        select: { payloadHash: true },
      });
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new ConflictException(
            'Webhook event identifier reuse detected',
          );
        }
        return {
          paymentId: payload.data.paymentId,
          status: transition.to,
          duplicate: true,
        };
      }
      const payment = await tx.payment.findUnique({
        where: {
          id: payload.data.paymentId,
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          method: true,
          providerReference: true,
        },
      });

      if (!payment) {
        throw new BadRequestException('Invalid webhook event');
      }

      if (payment.method !== null && payment.method !== undefined) {
        throw new ConflictException(
          'Use the payment provider reconciliation flow',
        );
      }

      if (
        payment.providerReference !== null &&
        payment.providerReference !== payload.data.providerReference
      ) {
        throw new ConflictException('Payment provider reference mismatch');
      }

      const incomingAmount = new Prisma.Decimal(payload.data.amount);

      if (payment.amount.toFixed(2) !== incomingAmount.toFixed(2)) {
        throw new ConflictException('Payment amount mismatch');
      }

      if (payment.currency !== payload.data.currency) {
        throw new ConflictException('Payment currency mismatch');
      }

      await tx.paymentWebhookEvent.create({
        data: {
          eventId: payload.eventId,
          eventType: payload.type,
          paymentId: payment.id,
          providerReference: payload.data.providerReference,
          payloadHash,
          receivedAt,
        },
      });

      const updateData: Prisma.PaymentUpdateManyMutationInput = {
        status: transition.to,
        providerReference: payload.data.providerReference,
      };

      if (transition.to === PaymentStatus.SUCCEEDED) {
        updateData.paidAt = new Date();
      }

      const updated = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: {
            in: transition.from,
          },
        },
        data: updateData,
      });

      if (updated.count !== 1) {
        throw new ConflictException('Invalid payment state transition');
      }

      await tx.paymentWebhookEvent.update({
        where: {
          eventId: payload.eventId,
        },
        data: {
          processedAt: new Date(),
        },
      });

      return {
        paymentId: payment.id,
        status: transition.to,
        duplicate: false,
      };
    });
  }
}
