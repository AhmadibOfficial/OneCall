import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { privateUploadPath } from '@/modules/upload/storage-path';
import * as argon2 from 'argon2';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
import { NIGERIA_SERVICES, NIGERIA_STATES } from '@/modules/services/nigeria';
import {
  AvailabilityDto,
  CatalogueDto,
  CaseDto,
  ManagementQuery,
  ScheduleDto,
  StaffDto,
} from './management.dto';
import {
  managementActor,
  permissionsFor,
  STAFF_ROLES,
} from './management.permissions';
const accountSelect = {
  id: true,
  uid: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  createdAt: true,
} as const;
@Injectable()
export class ManagementService {
  constructor(private readonly db: PrismaService) {}
  async session(id: string) {
    const user = await this.db.user.findFirstOrThrow({
      where: { id, status: 'ACTIVE', deletedAt: null },
      select: {
        uid: true,
        firstName: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    return {
      uid: user.uid,
      name: user.firstName,
      permissions: permissionsFor(user.roles.map((r) => r.role.name)),
    };
  }
  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    resourceId: string,
    action: string,
    reason: string,
    details: Prisma.InputJsonObject,
  ) {
    const value = reason.trim();
    if (value.length < 3 || value.length > 500)
      throw new BadRequestException('Record a reason of 3–500 characters');
    return tx.adminOperation.create({
      data: { actorId, resourceId, action, reason: value, details },
    });
  }
  async overview() {
    const now = new Date();
    const [
      unassigned,
      overdue,
      pendingProviders,
      unresolved,
      overdueCases,
      pendingAgents,
      pendingRoutes,
    ] = await Promise.all([
      this.db.order.count({ where: { status: 'PENDING', providerId: null } }),
      this.db.order.count({
        where: {
          status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS'] },
          scheduledAt: { lt: now },
        },
      }),
      this.db.provider.count({
        where: { approved: false, user: { status: 'ACTIVE', deletedAt: null } },
      }),
      this.db.supportTicket.count({ where: { status: { not: 'RESOLVED' } } }),
      this.db.supportTicket.count({
        where: { status: { not: 'RESOLVED' }, dueAt: { lt: now } },
      }),
      this.db.parcelAgent.count({ where: { status: 'PENDING' } }),
      this.db.parcelRoute.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      asOf: now,
      unassigned,
      overdue,
      pendingProviders,
      unresolved,
      overdueCases,
      pendingAgents,
      pendingRoutes,
    };
  }
  async customers(q: ManagementQuery) {
    const search = q.q?.trim();
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { uid: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.user.findMany({
        where,
        select: accountSelect,
        take: 25,
        skip: (q.page - 1) * 25,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.user.count({ where }),
    ]);
    return { items, total, page: q.page };
  }
  async customer(id: string) {
    const account = await this.db.user.findFirst({
      where: { id, deletedAt: null },
      select: accountSelect,
    });
    if (!account) throw new NotFoundException('Account unavailable');
    const [bookings, cases] = await Promise.all([
      this.db.order.findMany({
        where: { customerId: id },
        select: {
          id: true,
          serviceName: true,
          status: true,
          city: true,
          createdAt: true,
        },
        take: 50,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.supportTicket.findMany({
        where: { userId: id },
        select: { id: true, subject: true, status: true, createdAt: true },
        take: 50,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return { account, bookings, cases, limitPerHistory: 50 };
  }
  async cases(q: ManagementQuery) {
    const where: Prisma.SupportTicketWhereInput = q.q
      ? {
          OR: [
            { subject: { contains: q.q, mode: 'insensitive' } },
            { user: { uid: { contains: q.q } } },
            { status: { equals: q.q.toUpperCase() } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.db.supportTicket.findMany({
        where,
        select: {
          id: true,
          subject: true,
          message: true,
          response: true,
          status: true,
          priority: true,
          assignedToId: true,
          dueAt: true,
          updatedAt: true,
          user: { select: { uid: true } },
        },
        take: 25,
        skip: (q.page - 1) * 25,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.supportTicket.count({ where }),
    ]);
    const staff = await this.db.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        roles: {
          some: {
            role: {
              name: { in: ['ADMIN', 'ONECALL_OPERATIONS', 'ONECALL_SUPPORT'] },
            },
          },
        },
      },
      select: { id: true, uid: true, firstName: true },
      take: 100,
      orderBy: { uid: 'asc' },
    });
    return { items, total, page: q.page, staff };
  }
  async updateCase(actorId: string, id: string, dto: CaseDto) {
    return this.db.$transaction(async (tx) => {
      await managementActor(tx, actorId, 'support.write');
      await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const ticket = await tx.supportTicket.findUnique({ where: { id } });
      if (!ticket) throw new NotFoundException('Case unavailable');
      if (dto.assignedToId)
        await managementActor(tx, dto.assignedToId, 'support.write');
      if (dto.status === 'RESOLVED' && !dto.response?.trim())
        throw new BadRequestException(
          'A customer response is required to resolve a case',
        );
      // A support response never means that personal data has been deleted.
      if (
        ticket.subject === '[Privacy request] DELETION' &&
        dto.status === 'RESOLVED'
      )
        throw new ConflictException(
          'Deletion requests require the separate operator deletion procedure; a response cannot certify deletion',
        );
      const response = dto.response?.trim();
      const result = await tx.supportTicket.update({
        where: { id },
        data: {
          status: dto.status,
          priority: dto.priority,
          assignedToId: dto.assignedToId ?? null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          ...(response ? { response } : {}),
        },
        select: { id: true, status: true },
      });
      await this.audit(tx, actorId, id, 'CASE_UPDATED', dto.reason, {
        before: ticket.status,
        after: dto.status,
        priority: dto.priority,
        assignedToId: dto.assignedToId ?? null,
        dueAt: dto.dueAt ?? null,
      });
      if (response && response !== ticket.response)
        await tx.notification.create({
          data: {
            userId: ticket.userId,
            title: 'Support response',
            body: 'OneCall responded to your case. Open Support to read the response.',
          },
        });
      return result;
    });
  }
  async staff() {
    const items = await this.db.user.findMany({
      where: {
        deletedAt: null,
        roles: {
          some: {
            role: { name: { in: ['ADMIN', ...Object.keys(STAFF_ROLES)] } },
          },
        },
      },
      select: {
        ...accountSelect,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: { uid: 'asc' },
      take: 200,
    });
    return {
      items: items.map((u) => ({
        ...u,
        roles: u.roles
          .map((r) => r.role.name)
          .filter((r) => r === 'ADMIN' || r in STAFF_ROLES),
      })),
      availableRoles: STAFF_ROLES,
      limit: 200,
    };
  }
  async setStaff(actorId: string, dto: StaffDto) {
    return this.db.$transaction(async (tx) => {
      const owner = await managementActor(tx, actorId, 'owner');
      if (!(await argon2.verify(owner.passwordHash, dto.password)))
        throw new ForbiddenException('Confirm your OneCall password');
      const target = await tx.user.findUnique({
        where: { uid: dto.uid },
        select: { id: true },
      });
      if (!target || target.id === actorId)
        throw new ConflictException('Choose another existing active account');
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${target.id}::uuid FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: { id: target.id, status: 'ACTIVE', deletedAt: null },
        include: { roles: { include: { role: true } } },
      });
      if (!user || user.roles.some((r) => r.role.name === 'ADMIN'))
        throw new ConflictException(
          'Owner accounts cannot be changed through staff delegation',
        );
      const role = await tx.role.upsert({
        where: { name: dto.role },
        create: {
          name: dto.role,
          description: 'OneCall delegated management access',
        },
        update: {},
      });
      if (dto.enabled)
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: target.id, roleId: role.id } },
          create: { userId: target.id, roleId: role.id },
          update: {},
        });
      else
        await tx.userRole.deleteMany({
          where: { userId: target.id, roleId: role.id },
        });
      await this.audit(
        tx,
        actorId,
        target.id,
        'STAFF_ACCESS_CHANGED',
        dto.reason,
        { role: dto.role, enabled: dto.enabled },
      );
      return { uid: dto.uid, role: dto.role, enabled: dto.enabled };
    });
  }
  async schedule(actorId: string, id: string, dto: ScheduleDto) {
    const date = new Date(dto.scheduledAt);
    if (
      date.getTime() <= Date.now() ||
      date.getTime() > Date.now() + 365 * 86400000 ||
      !/(Z|[+-]\d{2}:\d{2})$/i.test(dto.scheduledAt)
    )
      throw new BadRequestException(
        'Choose a future date within one year, including a timezone',
      );
    return this.db.$transaction(async (tx) => {
      await managementActor(tx, actorId, 'bookings.write');
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id } });
      if (!order || !['PENDING', 'ACCEPTED'].includes(order.status))
        throw new ConflictException(
          'Only bookings before work starts can be rescheduled',
        );
      await tx.order.update({ where: { id }, data: { scheduledAt: date } });
      await this.audit(tx, actorId, id, 'BOOKING_RESCHEDULED', dto.reason, {
        before: order.scheduledAt?.toISOString() ?? null,
        after: date.toISOString(),
      });
      const provider = order.providerId
        ? await tx.provider.findUnique({
            where: { id: order.providerId },
            select: { userId: true },
          })
        : null;
      await tx.notification.createMany({
        data: [order.customerId, ...(provider ? [provider.userId] : [])].map(
          (userId) => ({
            userId,
            orderId: id,
            title: 'Booking schedule updated',
            body: 'Operations changed the requested time. Open your booking to review it.',
          }),
        ),
      });
      return { id, scheduledAt: date };
    });
  }
  async availability(actorId: string, id: string, dto: AvailabilityDto) {
    return this.db.$transaction(async (tx) => {
      await managementActor(tx, actorId, 'providers.write');
      await tx.$queryRaw`SELECT "id" FROM "Provider" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const provider = await tx.provider.findUnique({ where: { id } });
      if (!provider) throw new NotFoundException('Provider unavailable');
      const result = await tx.provider.update({
        where: { id },
        data: { available: dto.available },
        select: { id: true, available: true },
      });
      await this.audit(
        tx,
        actorId,
        id,
        'PROVIDER_AVAILABILITY_CHANGED',
        dto.reason,
        { before: provider.available, after: dto.available },
      );
      return result;
    });
  }
  async photo(
    actorId: string,
    orderId: string,
    photoId: string,
    reason: string,
  ) {
    const photo = await this.db.$transaction(async (tx) => {
      await managementActor(tx, actorId, 'bookings');
      const item = await tx.bookingPhoto.findFirst({
        where: { id: photoId, orderId },
      });
      if (!item || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(item.storageKey))
        throw new NotFoundException('Photo unavailable');
      await this.audit(tx, actorId, orderId, 'BOOKING_PHOTO_REVIEWED', reason, {
        photoId,
      });
      return item;
    });
    try {
      return {
        bytes: await readFile(
          resolve(privateUploadPath('booking-photos'), photo.storageKey),
        ),
        mime: photo.mime,
      };
    } catch {
      throw new NotFoundException('Photo unavailable');
    }
  }
  async finance(q: ManagementQuery) {
    const [items, total] = await Promise.all([
      this.db.payment.findMany({
        select: {
          id: true,
          orderId: true,
          amount: true,
          currency: true,
          status: true,
          providerMode: true,
          providerReference: true,
          paidAt: true,
          createdAt: true,
        },
        take: 25,
        skip: (q.page - 1) * 25,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.payment.count(),
    ]);
    return {
      items,
      total,
      page: q.page,
      mode: process.env.ONECALL_PAYMENT_MODE ?? 'disabled',
      liveApproved: process.env.ONECALL_PAYMENTS_LIVE_APPROVED === 'true',
      refundExecutionAvailable: false,
      commissionLedgerAvailable: false,
    };
  }
  async reports() {
    const since = new Date(Date.now() - 30 * 86400000);
    const [statuses, providers, repeats, collections] = await Promise.all([
      this.db.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.db.order.groupBy({
        by: ['providerId'],
        where: { createdAt: { gte: since }, providerId: { not: null } },
        _count: { _all: true },
      }),
      this.db.order.groupBy({
        by: ['customerId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.db.payment.groupBy({
        by: ['currency'],
        where: {
          status: 'SUCCEEDED',
          providerMode: 'live',
          paidAt: { gte: since },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    const total = statuses.reduce((n, s) => n + s._count._all, 0),
      completed =
        statuses.find((s) => s.status === 'COMPLETED')?._count._all ?? 0;
    return {
      since,
      asOf: new Date(),
      bookings: total,
      completed,
      completionRate: total ? completed / total : null,
      activeProviders: providers.length,
      repeatBookingCustomers: repeats.filter((r) => r._count._all > 1).length,
      bookingCustomers: repeats.length,
      statuses,
      verifiedLiveCollections: collections,
      recognizedRevenue: null,
      definitions:
        'Completion rate: completed / created bookings in the last 30 days. Repeat customers: more than one booking created in that window. Live collections are gross successful payments, not recognized OneCall revenue. Test payments excluded.',
    };
  }
  async auditLog(q: ManagementQuery) {
    const where: Prisma.AdminOperationWhereInput = q.q
      ? { action: { contains: q.q.toUpperCase() } }
      : {};
    const [items, total] = await Promise.all([
      this.db.adminOperation.findMany({
        where,
        take: 25,
        skip: (q.page - 1) * 25,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.adminOperation.count({ where }),
    ]);
    return { items, total, page: q.page };
  }
  async catalogue() {
    const settings = await this.db.serviceSetting.findMany();
    return {
      states: NIGERIA_STATES,
      services: NIGERIA_SERVICES.map((service) => ({
        ...service,
        ...settings.find((s) => s.key === service.key),
        enabled: settings.find((s) => s.key === service.key)?.enabled ?? true,
      })),
      availability:
        'Approved provider coverage and approved parcel routes determine location availability.',
    };
  }
  async setCatalogue(actorId: string, key: string, dto: CatalogueDto) {
    if (!NIGERIA_SERVICES.some((s) => s.key === key))
      throw new BadRequestException('Unknown service');
    if (!dto.description.trim())
      throw new BadRequestException('Enter a service description');
    return this.db.$transaction(async (tx) => {
      await managementActor(tx, actorId, 'owner');
      const before = await tx.serviceSetting.findUnique({ where: { key } });
      const data = {
        description: dto.description.trim(),
        enabled: dto.enabled,
      };
      const result = await tx.serviceSetting.upsert({
        where: { key },
        create: { key, ...data },
        update: data,
      });
      await this.audit(tx, actorId, actorId, 'CATALOGUE_UPDATED', dto.reason, {
        key,
        before: before
          ? { description: before.description, enabled: before.enabled }
          : null,
        after: data,
      });
      return result;
    });
  }
}
