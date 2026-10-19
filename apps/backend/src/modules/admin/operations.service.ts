import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
import {
  NIGERIA_STATES,
  NIGERIA_SERVICES,
  cityKey,
} from '@/modules/services/nigeria';
import { ApprovalDto, AssignmentDto, OperationsQuery } from './operations.dto';
@Injectable()
export class AdminOperationsService {
  constructor(private readonly prisma: PrismaService) {}
  catalogue() {
    return { states: NIGERIA_STATES, services: NIGERIA_SERVICES };
  }
  private reason(value: string) {
    const reason = value.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new BadRequestException('Provide a reason of 3–500 characters');
    return reason;
  }
  private async actor(tx: Prisma.TransactionClient, id: string) {
    // Share lock prevents a concurrent account/password update during this operation.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id}::uuid FOR SHARE`;
    const user = await tx.user.findFirst({
      where: {
        id,
        status: 'ACTIVE',
        deletedAt: null,
        roles: { some: { role: { name: 'ADMIN' } } },
      },
    });
    if (!user) throw new ForbiddenException('Admin access required');
  }
  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    resourceId: string,
    action: string,
    reason: string,
    details: Prisma.InputJsonObject,
  ) {
    return tx.adminOperation.create({
      data: { actorId, resourceId, action, reason, details },
    });
  }
  async providers(q: OperationsQuery) {
    const search = q.q?.trim();
    const where: Prisma.ProviderWhereInput = search
      ? {
          OR: [
            { displayName: { contains: search, mode: 'insensitive' } },
            { user: { uid: { contains: search } } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.provider.findMany({
        where,
        take: 25,
        skip: (q.page - 1) * 25,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          approved: true,
          displayName: true,
          user: {
            select: {
              uid: true,
              email: true,
              status: true,
              emailVerified: true,
              phoneVerified: true,
            },
          },
          coverage: {
            select: { state: true, cityKey: true, serviceName: true },
          },
        },
      }),
      this.prisma.provider.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: 25 };
  }
  async approve(actorId: string, id: string, dto: ApprovalDto) {
    const reason = this.reason(dto.reason);
    const normalized = dto.city.trim() === '*' ? '*' : cityKey(dto.city);
    if (
      !NIGERIA_STATES.some((state) => state === dto.state) ||
      !normalized ||
      !dto.services.length
    )
      throw new BadRequestException('Invalid coverage');
    const names = dto.services.map((key) => {
      const service = NIGERIA_SERVICES.find((s) => s.key === key);
      if (!service) throw new BadRequestException('Invalid service');
      return service.name;
    });
    return this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actorId);
      const snapshot = await tx.provider.findUnique({ where: { id } });
      if (!snapshot) throw new NotFoundException('Provider not found');
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${snapshot.userId}::uuid FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "Provider" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const provider = await tx.provider.findUniqueOrThrow({
        where: { id },
        include: { user: true },
      });
      if (
        provider.user.status !== 'ACTIVE' ||
        provider.user.deletedAt ||
        !provider.user.emailVerified ||
        !provider.user.phoneVerified
      )
        throw new ConflictException(
          'Provider must have an active, email- and phone-verified account',
        );
      // Proposed coverage is not approved automatically. Later approvals add vetted areas.
      if (!provider.approved)
        await tx.providerCoverage.deleteMany({ where: { providerId: id } });
      for (const serviceName of names) {
        const area = {
          providerId: id,
          state: dto.state,
          cityKey: normalized,
          serviceName,
        };
        await tx.providerCoverage.upsert({
          where: { providerId_state_cityKey_serviceName: area },
          create: area,
          update: {},
        });
      }
      await tx.provider.update({ where: { id }, data: { approved: true } });
      await this.audit(tx, actorId, id, 'PROVIDER_APPROVED', reason, {
        state: dto.state,
        cityKey: normalized,
        services: names,
      });
      await tx.notification.create({
        data: {
          userId: provider.userId,
          title: 'Provider approval',
          body: 'Your reviewed service coverage is approved. Open Provider workspace.',
        },
      });
      return { approved: true, providerId: id };
    });
  }
  async revoke(actorId: string, id: string, value: string) {
    const reason = this.reason(value);
    return this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actorId);
      await tx.$queryRaw`SELECT "id" FROM "Provider" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const provider = await tx.provider.findUnique({ where: { id } });
      if (!provider) throw new NotFoundException('Provider not found');
      if (!provider.approved)
        throw new ConflictException('Provider approval is already revoked');
      if (
        await tx.order.count({
          where: {
            providerId: id,
            status: { in: ['ACCEPTED', 'IN_PROGRESS'] },
          },
        })
      )
        throw new ConflictException(
          'Resolve active bookings before revoking approval',
        );
      await tx.provider.update({ where: { id }, data: { approved: false } });
      await this.audit(tx, actorId, id, 'PROVIDER_REVOKED', reason, {});
      await tx.notification.create({
        data: {
          userId: provider.userId,
          title: 'Provider approval revoked',
          body: 'Your approval has been revoked. Contact Support for assistance.',
        },
      });
      return { approved: false, providerId: id };
    });
  }
  async bookings(q: OperationsQuery) {
    const search = q.q?.trim();
    const where: Prisma.OrderWhereInput = {
      ...(q.status ? { status: q.status as OrderStatus } : {}),
      ...(search
        ? {
            OR: [
              ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                search,
              )
                ? [{ id: search }]
                : []),
              {
                serviceName: { contains: search, mode: 'insensitive' as const },
              },
              { city: { contains: search, mode: 'insensitive' as const } },
              { customer: { uid: { contains: search } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        take: 25,
        skip: (q.page - 1) * 25,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          serviceName: true,
          state: true,
          city: true,
          status: true,
          customer: { select: { uid: true } },
          provider: { select: { user: { select: { uid: true } } } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: 25 };
  }
  async detail(id: string) {
    const booking = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        serviceName: true,
        state: true,
        city: true,
        address: true,
        pickupAddress: true,
        destinationAddress: true,
        description: true,
        scheduledAt: true,
        createdAt: true,
        updatedAt: true,
        quoteRequired: true,
        amount: true,
        customer: { select: { uid: true } },
        provider: { select: { id: true, user: { select: { uid: true } } } },
        quote: { select: { id: true, acceptedAt: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    const history = await this.prisma.adminOperation.findMany({
      where: { resourceId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const eligibleProviders =
      booking.status === 'PENDING'
        ? await this.prisma.provider.findMany({
            where: {
              approved: true,
              user: {
                status: 'ACTIVE',
                deletedAt: null,
                emailVerified: true,
                phoneVerified: true,
              },
              userId: {
                not: (
                  await this.prisma.order.findUniqueOrThrow({
                    where: { id },
                    select: { customerId: true },
                  })
                ).customerId,
              },
              coverage: {
                some: {
                  state: booking.state,
                  serviceName: booking.serviceName,
                  cityKey: { in: [cityKey(booking.city), '*'] },
                },
              },
            },
            take: 100,
            orderBy: { id: 'asc' },
            select: {
              id: true,
              displayName: true,
              user: { select: { uid: true } },
            },
          })
        : [];
    return { booking, history, eligibleProviders };
  }
  async assign(actorId: string, id: string, dto: AssignmentDto) {
    const reason = this.reason(dto.reason);
    return this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actorId);
      // Same provider -> order lock order as provider self-accept.
      await tx.$queryRaw`SELECT "id" FROM "Provider" WHERE "id" = ${dto.providerId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const provider = await tx.provider.findUnique({
        where: { id: dto.providerId },
        include: { user: true },
      });
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Booking not found');
      if (order.status !== 'PENDING' || order.providerId)
        throw new ConflictException(
          'Only unassigned pending requests can be assigned',
        );
      if (
        !provider?.approved ||
        provider.user.status !== 'ACTIVE' ||
        provider.user.deletedAt ||
        !provider.user.emailVerified ||
        !provider.user.phoneVerified
      )
        throw new ConflictException(
          'Select an approved active verified provider',
        );
      if (provider.userId === order.customerId)
        throw new ConflictException(
          'A provider cannot fulfil their own request',
        );
      if (
        !(await tx.providerCoverage.findFirst({
          where: {
            providerId: provider.id,
            state: order.state,
            serviceName: order.serviceName,
            cityKey: { in: [order.cityKey, '*'] },
          },
        }))
      )
        throw new ConflictException(
          'Provider does not cover this service and area',
        );
      await tx.order.update({
        where: { id },
        data: { providerId: provider.id, status: 'ACCEPTED' },
      });
      await this.audit(tx, actorId, id, 'BOOKING_ASSIGNED', reason, {
        from: 'PENDING',
        to: 'ACCEPTED',
        providerId: provider.id,
      });
      await tx.notification.createMany({
        data: [
          {
            userId: order.customerId,
            orderId: id,
            title: 'Provider assigned',
            body: 'Operations assigned an approved provider to your request.',
          },
          {
            userId: provider.userId,
            orderId: id,
            title: 'Booking assigned',
            body: 'Operations assigned a booking. Open Provider workspace to review and quote.',
          },
        ],
      });
      return { id, status: 'ACCEPTED', providerId: provider.id };
    });
  }
  async cancel(actorId: string, id: string, value: string) {
    const reason = this.reason(value);
    return this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actorId);
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id },
        include: { provider: { select: { userId: true } } },
      });
      if (!order) throw new NotFoundException('Booking not found');
      if (!['PENDING', 'ACCEPTED', 'IN_PROGRESS'].includes(order.status))
        throw new ConflictException('Booking is already terminal');
      if (
        (await tx.payment.count({
          where: {
            orderId: id,
            status: { in: ['INITIATED', 'PENDING', 'SUCCEEDED'] },
          },
        })) ||
        (await tx.checkoutIntent.count({
          where: {
            orderId: id,
            status: { in: ['INITIALIZING', 'PENDING', 'SUCCEEDED'] },
          },
        }))
      )
        throw new ConflictException(
          'Resolve payment or checkout through Support before cancellation',
        );
      await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });
      await tx.orderLocation.deleteMany({ where: { orderId: id } });
      await this.audit(tx, actorId, id, 'BOOKING_CANCELLED', reason, {
        from: order.status,
        to: 'CANCELLED',
      });
      const users = [
        order.customerId,
        ...(order.provider ? [order.provider.userId] : []),
      ];
      await tx.notification.createMany({
        data: [...new Set(users)].map((userId) => ({
          userId,
          orderId: id,
          title: 'Booking cancelled',
          body: 'Operations cancelled this booking. Contact Support for details.',
        })),
      });
      return { id, status: 'CANCELLED' };
    });
  }
}
