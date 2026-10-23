import { Injectable, ConflictException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
import { cityKey } from '@/modules/services/nigeria';
import { CreateOrderDto } from '../dto/create-order.dto';

const orderSelect = {
  id: true,
  serviceName: true,
  state: true,
  city: true,
  address: true,
  description: true,
  amount: true,
  status: true,
  providerId: true,
  pickupAddress: true,
  destinationAddress: true,
  scheduledAt: true,
  vehicleType: true,
  createdAt: true,
  updatedAt: true,
  quote: { select: { id: true, amount: true, acceptedAt: true } },
  provider: {
    select: {
      displayName: true,
      vehicleDescription: true,
      user: {
        select: { uid: true, firstName: true, lastName: true, phone: true },
      },
    },
  },
  payments: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { status: true, providerMode: true },
  },
} as const;

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(customerId: string, data: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId,
          serviceName: data.serviceName,
          quoteRequired: true,
          state: data.state ?? 'Kaduna',
          city: data.city?.trim() ?? 'Kaduna',
          cityKey: cityKey(data.city ?? 'Kaduna'),
          address: data.address?.trim() ?? null,
          description: data.description?.trim() ?? null,
          pickupAddress: data.pickupAddress?.trim() ?? null,
          destinationAddress: data.destinationAddress?.trim() ?? null,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          vehicleType: data.vehicleType ?? null,
        },
        select: orderSelect,
      });
      await tx.notification.create({
        data: {
          userId: customerId,
          orderId: order.id,
          title: 'Request sent',
          body: `${order.serviceName} in ${order.city}, ${order.state}. Awaiting a provider.`,
        },
      });
      return order;
    });
  }

  findManyForUser(userId: string) {
    return this.prisma.order.findMany({
      where: { OR: [{ customerId: userId }, { provider: { userId } }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: orderSelect,
    });
  }

  findByIdForUser(id: string, userId: string) {
    return this.prisma.order.findFirst({
      where: {
        id,
        OR: [{ customerId: userId }, { provider: { userId } }],
      },
      select: orderSelect,
    });
  }

  findByCustomer(id: string, customerId: string) {
    return this.prisma.order.findFirst({
      where: { id, customerId },
      select: orderSelect,
    });
  }

  findProviderByUserId(userId: string) {
    return this.prisma.provider.findUnique({
      where: { userId },
      select: { id: true, approved: true },
    });
  }

  async findAvailableOrders(providerId: string) {
    const coverage = await this.prisma.providerCoverage.findMany({
      where: { providerId },
    });
    if (!coverage.length) return [];
    return this.prisma.order.findMany({
      where: {
        status: 'PENDING',
        providerId: null,
        OR: coverage.map((area) => ({
          state: area.state,
          serviceName: area.serviceName,
          ...(area.cityKey === '*' ? {} : { cityKey: area.cityKey }),
        })),
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: orderSelect,
    });
  }

  async claimPendingOrder(id: string, providerId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Provider" WHERE "id" = ${providerId}::uuid FOR UPDATE`;
      const provider = await tx.provider.findFirst({
        where: { id: providerId, approved: true },
      });
      const order = await tx.order.findUnique({ where: { id } });
      if (!provider || !order || provider.userId === order.customerId)
        return { count: 0 };
      const area = await tx.providerCoverage.findFirst({
        where: {
          providerId,
          state: order.state,
          serviceName: order.serviceName,
          cityKey: { in: [order.cityKey, '*'] },
        },
      });
      if (!area) return { count: 0 };
      const result = await tx.order.updateMany({
        where: { id, providerId: null, status: 'PENDING' },
        data: { providerId, status: 'ACCEPTED' },
      });
      if (result.count === 1)
        await this.notify(
          tx,
          id,
          'Provider accepted',
          'Your provider has accepted the request.',
        );
      return result;
    });
  }

  startOrder(id: string, providerId: string) {
    return this.transition(
      id,
      { providerId, status: 'ACCEPTED' },
      'IN_PROGRESS',
      'Work in progress',
    );
  }

  completeOrder(id: string, providerId: string) {
    return this.transition(
      id,
      { providerId, status: 'IN_PROGRESS' },
      'COMPLETED',
      'Completed',
    );
  }

  cancelOrder(id: string, customerId: string) {
    return this.transition(
      id,
      { customerId, status: { in: ['PENDING', 'ACCEPTED'] } },
      'CANCELLED',
      'Cancelled',
    );
  }

  private transition(
    id: string,
    where: Prisma.OrderWhereInput,
    status: OrderStatus,
    title: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (status === 'IN_PROGRESS') {
        const order = await tx.order.findUnique({
          where: { id },
          include: { quote: true },
        });
        if (
          order?.quoteRequired &&
          (!order.amount || !order.quote?.acceptedAt)
        ) {
          throw new ConflictException(
            'The customer must accept a provider quote before work starts',
          );
        }
      }
      if (status === 'CANCELLED') {
        const paid = await tx.payment.findFirst({
          where: {
            orderId: id,
            status: { in: ['INITIATED', 'PENDING', 'SUCCEEDED'] },
          },
        });
        if (paid)
          throw new ConflictException(
            'Resolve the pending payment or contact support to refund a paid booking',
          );
        const checkout = await tx.checkoutIntent.findFirst({
          where: { orderId: id, status: { in: ['INITIALIZING', 'PENDING'] } },
        });
        if (checkout)
          throw new ConflictException(
            'Finish or resolve the pending checkout before cancelling',
          );
      }
      const result = await tx.order.updateMany({
        where: { id, ...where },
        data: { status },
      });
      if (result.count === 1) {
        await this.notify(
          tx,
          id,
          title,
          `The request status is now ${title.toLowerCase()}.`,
        );
        if (status === 'COMPLETED' || status === 'CANCELLED') {
          await tx.orderLocation.deleteMany({ where: { orderId: id } });
        }
      }
      return result;
    });
  }

  private async notify(
    tx: Prisma.TransactionClient,
    orderId: string,
    title: string,
    body: string,
  ) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        customerId: true,
        provider: { select: { userId: true } },
      },
    });
    const recipients = new Set([
      order.customerId,
      ...(order.provider ? [order.provider.userId] : []),
    ]);
    await tx.notification.createMany({
      data: [...recipients].map((userId) => ({ userId, orderId, title, body })),
    });
  }
}
