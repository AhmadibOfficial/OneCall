import { ConflictException, Injectable } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';

import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';

const paymentSelect = {
  id: true,
  amount: true,
  currency: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOrderForCustomer(orderId: string, customerId: string) {
    return this.prisma.order.findFirst({
      where: {
        id: orderId,
        customerId,
      },
      select: {
        id: true,
        customerId: true,
        amount: true,
        status: true,
      },
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.payment.findUnique({
      where: {
        idempotencyKey,
      },
      include: {
        order: {
          select: {
            customerId: true,
            id: true,
          },
        },
      },
    });
  }

  create(
    orderId: string,
    amount: unknown,
    currency: string,
    idempotencyKey: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const current = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      if (
        current.status === 'CANCELLED' ||
        !current.amount ||
        current.amount.toString() !== String(amount)
      ) {
        throw new ConflictException('This order is no longer payable');
      }
      const duplicate = await tx.payment.findUnique({
        where: { idempotencyKey },
        select: { ...paymentSelect, orderId: true },
      });
      if (duplicate) {
        if (duplicate.orderId !== orderId)
          throw new ConflictException('Idempotency key is already in use');
        return duplicate;
      }
      if (
        (await tx.checkoutIntent.findFirst({
          where: { orderId, status: { in: ['INITIALIZING', 'PENDING'] } },
        })) ||
        (await tx.payment.findFirst({
          where: {
            orderId,
            status: { in: ['INITIATED', 'PENDING', 'SUCCEEDED'] },
          },
        }))
      ) {
        throw new ConflictException(
          'This booking already has a payment or checkout',
        );
      }
      return tx.payment.create({
        data: { orderId, amount: current.amount, currency, idempotencyKey },
        select: paymentSelect,
      });
    });
  }

  findById(id: string) {
    return this.prisma.payment.findUnique({
      where: { id },
      select: {
        ...paymentSelect,
        orderId: true,
      },
    });
  }

  moveToPending(id: string) {
    return this.prisma.payment.updateMany({
      where: {
        id,
        status: PaymentStatus.INITIATED,
      },
      data: {
        status: PaymentStatus.PENDING,
      },
    });
  }

  markSucceeded(id: string, providerReference: string) {
    return this.prisma.payment.updateMany({
      where: {
        id,
        status: {
          in: [PaymentStatus.INITIATED, PaymentStatus.PENDING],
        },
      },
      data: {
        status: PaymentStatus.SUCCEEDED,
        providerReference,
        paidAt: new Date(),
      },
    });
  }

  markFailed(id: string) {
    return this.prisma.payment.updateMany({
      where: {
        id,
        status: {
          in: [PaymentStatus.INITIATED, PaymentStatus.PENDING],
        },
      },
      data: {
        status: PaymentStatus.FAILED,
      },
    });
  }

  markRefunded(id: string) {
    return this.prisma.payment.updateMany({
      where: {
        id,
        status: PaymentStatus.SUCCEEDED,
      },
      data: {
        status: PaymentStatus.REFUNDED,
      },
    });
  }
}
