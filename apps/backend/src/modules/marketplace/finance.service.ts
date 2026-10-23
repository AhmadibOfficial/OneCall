import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
import { CheckoutDto } from './marketplace.dto';
import { PaystackGateway } from './paystack.gateway';

export function naira(kobo: bigint) {
  const sign = kobo < 0n ? '-' : '';
  const absolute = kobo < 0n ? -kobo : kobo;
  return (
    sign +
    (absolute / 100n).toString() +
    '.' +
    (absolute % 100n).toString().padStart(2, '0')
  );
}
function kobo(amount: string) {
  return BigInt(new Prisma.Decimal(amount).mul(100).toFixed(0));
}
function checkoutResponse(intent: {
  id: string;
  orderId: string | null;
  amountKobo: bigint;
  providerMode: string;
  status: string;
  checkoutUrl: string | null;
  createdAt: Date;
}) {
  return {
    id: intent.id,
    orderId: intent.orderId,
    amount: naira(intent.amountKobo),
    currency: 'NGN',
    paymentMode: intent.providerMode,
    status: intent.status,
    checkoutUrl: intent.checkoutUrl,
    createdAt: intent.createdAt,
  };
}
const activeStatuses = ['INITIALIZING', 'PENDING'];

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaystackGateway,
  ) {}
  async wallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: { entries: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    return {
      currency: 'NGN',
      balance: naira(wallet?.balanceKobo ?? 0n),
      checkoutEnabled: this.gateway.enabled,
      fundingEnabled: this.gateway.walletEnabled,
      walletPaymentEnabled: this.gateway.walletEnabled,
      paymentMode: this.gateway.enabled
        ? this.gateway.configuration.mode
        : 'disabled',
      transactions: (wallet?.entries ?? []).map((entry) => ({
        id: entry.id,
        amount: naira(entry.amountKobo),
        description: entry.description,
        createdAt: entry.createdAt,
      })),
    };
  }
  async checkouts(userId: string) {
    const intents = await this.prisma.checkoutIntent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return intents.map(checkoutResponse);
  }
  private async payable(
    tx: Prisma.TransactionClient,
    userId: string,
    orderId: string,
  ) {
    const order = await tx.order.findFirst({
      where: { id: orderId, customerId: userId },
      include: { quote: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (
      order.status === 'CANCELLED' ||
      !order.amount ||
      !order.quote?.acceptedAt ||
      order.amount.lte(0)
    ) {
      throw new ConflictException('Accept your provider quote before paying');
    }
    if (
      await tx.payment.findFirst({
        where: {
          orderId,
          status: { in: ['INITIATED', 'PENDING', 'SUCCEEDED'] },
        },
      })
    ) {
      throw new ConflictException(
        'This order already has a payment or a payment in progress',
      );
    }
    return order;
  }
  async checkout(userId: string, input: CheckoutDto) {
    if (!this.gateway.enabled)
      throw new ServiceUnavailableException(
        'Secure checkout is not configured yet',
      );
    if (input.orderId && input.amount !== undefined)
      throw new BadRequestException(
        'The order price is set by the accepted provider quote',
      );
    if (!input.orderId && (!this.gateway.walletEnabled || !input.amount)) {
      throw new ServiceUnavailableException(
        'Wallet funding is not enabled yet',
      );
    }
    const existing = await this.prisma.checkoutIntent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    const validateExisting = (intent: NonNullable<typeof existing>) => {
      if (
        intent.userId !== userId ||
        intent.orderId !== (input.orderId ?? null) ||
        (!input.orderId && intent.amountKobo !== kobo(input.amount!))
      )
        throw new ConflictException('Idempotency key is already in use');
      if (
        intent.status !== 'SUCCEEDED' &&
        intent.providerMode !== this.gateway.configuration.mode
      )
        throw new ConflictException(
          'This checkout belongs to a different payment mode. Contact Support.',
        );
      return checkoutResponse(intent);
    };
    if (existing) return validateExisting(existing);
    let intent;
    try {
      intent = await this.prisma.$transaction(async (tx) => {
        let amountKobo: bigint;
        if (input.orderId) {
          await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${input.orderId}::uuid FOR UPDATE`;
          const duplicate = await tx.checkoutIntent.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
          });
          if (duplicate) return { intent: duplicate, existing: true };
          const order = await this.payable(tx, userId, input.orderId);
          if (
            await tx.checkoutIntent.findFirst({
              where: { orderId: input.orderId, status: { in: activeStatuses } },
            })
          ) {
            throw new ConflictException(
              'A checkout is already pending for this booking',
            );
          }
          amountKobo = kobo(order.amount!.toFixed(2));
        } else {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
          const duplicate = await tx.checkoutIntent.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
          });
          if (duplicate) return { intent: duplicate, existing: true };
          amountKobo = kobo(input.amount!);
          if (
            (await tx.checkoutIntent.count({
              where: { userId, orderId: null, status: { in: activeStatuses } },
            })) >= 5
          ) {
            throw new ConflictException(
              'Resolve your pending wallet checkouts before creating another',
            );
          }
        }
        const created = await tx.checkoutIntent.create({
          data: {
            userId,
            orderId: input.orderId ?? null,
            amountKobo,
            providerMode: this.gateway.configuration.mode,
            idempotencyKey: input.idempotencyKey,
            reference: 'onecall-' + randomUUID(),
          },
        });
        return { intent: created, existing: false };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.checkoutIntent.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (winner) return validateExisting(winner);
      }
      throw error;
    }
    if (intent.existing) return validateExisting(intent.intent);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    let url: string;
    try {
      url = await this.gateway.initialize(
        intent.intent.reference,
        intent.intent.amountKobo,
        user.email,
      );
    } catch {
      // An ambiguous network failure cannot authorize a second charge.
      // Return the durable reference to allow authenticated reconciliation.
      return checkoutResponse(intent.intent);
    }
    const result = await this.prisma.checkoutIntent.updateMany({
      where: { id: intent.intent.id, status: 'INITIALIZING' },
      data: { checkoutUrl: url, status: 'PENDING' },
    });
    if (result.count === 0) {
      return checkoutResponse(
        await this.prisma.checkoutIntent.findUniqueOrThrow({
          where: { id: intent.intent.id },
        }),
      );
    }
    return checkoutResponse({
      ...intent.intent,
      checkoutUrl: url,
      status: 'PENDING',
    });
  }
  async verifyOwned(userId: string, id: string) {
    const intent = await this.prisma.checkoutIntent.findFirst({
      where: { userId, id },
    });
    if (!intent) throw new NotFoundException('Checkout not found');
    await this.settle(intent.reference);
    return checkoutResponse(
      await this.prisma.checkoutIntent.findUniqueOrThrow({ where: { id } }),
    );
  }
  async webhook(
    raw: Buffer | undefined,
    signature: string | undefined,
    body: unknown,
  ) {
    this.gateway.verifySignature(raw, signature);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid payment event');
    const event = body as { event?: unknown; data?: { reference?: unknown } };
    if (event.event !== 'charge.success') return { received: true };
    const reference = event.data?.reference;
    if (
      typeof reference !== 'string' ||
      !/^onecall-[0-9a-f-]{36}$/.test(reference)
    )
      return { received: true };
    await this.settle(reference);
    return { received: true };
  }
  private async settle(reference: string) {
    const snapshot = await this.prisma.checkoutIntent.findUnique({
      where: { reference },
    });
    if (!snapshot || snapshot.status === 'SUCCEEDED') return;
    if (
      !this.gateway.enabled ||
      snapshot.providerMode !== this.gateway.configuration.mode
    )
      throw new ConflictException(
        'This checkout belongs to a different payment mode. Contact Support.',
      );
    const verified = await this.gateway.verify(reference);
    if (!verified.successful) return;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: snapshot.userId },
      select: { email: true },
    });
    if (
      verified.amountKobo !== snapshot.amountKobo ||
      verified.email !== user.email.toLowerCase()
    ) {
      throw new ConflictException('Payment amount or customer mismatch');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CheckoutIntent" WHERE "id" = ${snapshot.id}::uuid FOR UPDATE`;
      const intent = await tx.checkoutIntent.findUniqueOrThrow({
        where: { id: snapshot.id },
      });
      if (intent.status === 'SUCCEEDED') return;
      if (!activeStatuses.includes(intent.status))
        throw new ConflictException('Invalid checkout transition');
      if (intent.orderId) {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${intent.orderId}::uuid FOR UPDATE`;
        const order = await tx.order.findUniqueOrThrow({
          where: { id: intent.orderId },
        });
        if (
          order.customerId !== intent.userId ||
          !order.amount ||
          kobo(order.amount.toFixed(2)) !== intent.amountKobo ||
          order.status === 'CANCELLED'
        ) {
          throw new ConflictException(
            'The payment does not match the current booking',
          );
        }
        if (
          await tx.payment.findFirst({
            where: { orderId: intent.orderId, status: 'SUCCEEDED' },
          })
        ) {
          throw new ConflictException('This booking is already paid');
        }
        await tx.payment.create({
          data: {
            orderId: intent.orderId,
            amount: new Prisma.Decimal(naira(intent.amountKobo)),
            currency: 'NGN',
            method: 'PAYSTACK',
            providerMode: intent.providerMode,
            status: 'SUCCEEDED',
            idempotencyKey: 'checkout.' + intent.id,
            providerReference: 'paystack-' + intent.reference,
            paidAt: new Date(),
          },
        });
      } else {
        const wallet = await tx.wallet.upsert({
          where: { userId: intent.userId },
          create: { userId: intent.userId },
          update: {},
        });
        await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "id" = ${wallet.id}::uuid FOR UPDATE`;
        await tx.walletEntry.create({
          data: {
            walletId: wallet.id,
            reference: 'paystack-' + intent.reference,
            amountKobo: intent.amountKobo,
            description: 'Wallet funding',
          },
        });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balanceKobo: { increment: intent.amountKobo } },
        });
      }
      await tx.checkoutIntent.update({
        where: { id: intent.id },
        data: { status: 'SUCCEEDED', paidAt: new Date() },
      });
      await tx.notification.create({
        data: {
          userId: intent.userId,
          orderId: intent.orderId,
          title:
            intent.providerMode === 'test'
              ? 'Test payment successful'
              : 'Payment successful',
          body: `₦${naira(intent.amountKobo)} ${intent.orderId ? 'paid for your booking' : 'added to your wallet'}.`,
        },
      });
    });
  }
  async payWallet(userId: string, orderId: string, idempotencyKey: string) {
    if (!this.gateway.walletEnabled) {
      throw new ServiceUnavailableException('Wallet payments are not enabled');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey },
        include: { order: { select: { customerId: true } } },
      });
      if (existing) {
        if (
          existing.orderId !== orderId ||
          existing.order.customerId !== userId ||
          existing.method !== 'WALLET'
        ) {
          throw new ConflictException('Idempotency key is already in use');
        }
        return {
          paid: true,
          amount: existing.amount.toFixed(2),
          currency: 'NGN',
        };
      }
      const order = await this.payable(tx, userId, orderId);
      if (
        await tx.checkoutIntent.findFirst({
          where: { orderId, status: { in: activeStatuses } },
        })
      ) {
        throw new ConflictException(
          'A checkout is already pending for this booking',
        );
      }
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet)
        throw new ConflictException('Your wallet has insufficient funds');
      await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "id" = ${wallet.id}::uuid FOR UPDATE`;
      const current = await tx.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
      });
      const amount = kobo(order.amount!.toFixed(2));
      if (current.balanceKobo < amount)
        throw new ConflictException('Your wallet has insufficient funds');
      const reference = 'wallet-' + randomUUID();
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceKobo: { decrement: amount } },
      });
      await tx.walletEntry.create({
        data: {
          walletId: wallet.id,
          reference,
          amountKobo: -amount,
          description: order.serviceName,
        },
      });
      await tx.payment.create({
        data: {
          orderId,
          amount: order.amount!,
          currency: 'NGN',
          method: 'WALLET',
          providerMode: this.gateway.configuration.mode,
          status: 'SUCCEEDED',
          idempotencyKey,
          providerReference: reference,
          paidAt: new Date(),
        },
      });
      await tx.notification.create({
        data: {
          userId,
          orderId,
          title: 'Payment successful',
          body: `₦${naira(amount)} paid from your wallet.`,
        },
      });
      return { paid: true, amount: naira(amount), currency: 'NGN' };
    });
  }
}
