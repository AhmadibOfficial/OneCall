import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParcelStatus, Prisma } from '@prisma/client';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '@/infrastructure/database/prisma';
import {
  ParcelAgentDto,
  ParcelCreateDto,
  ParcelListQuery,
  ParcelMoveDto,
  ParcelReviewDto,
  ParcelRouteDto,
  ParcelRouteReviewDto,
} from './parcel.dto';

const activeUser = {
  status: 'ACTIVE' as const,
  deletedAt: null,
};
const availableAgent = { status: 'APPROVED' as const, user: activeUser };
const terminal: ParcelStatus[] = ['DELIVERED', 'CANCELLED', 'RETURNED'];
const shopSelect = {
  id: true,
  shopName: true,
  address: true,
  state: true,
  city: true,
  status: true,
};
const routeInclude = {
  originAgent: { select: shopSelect },
  destinationAgent: { select: shopSelect },
};
const shipmentInclude = {
  ...routeInclude,
  events: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    take: 100,
    select: { id: true, kind: true, status: true, note: true, createdAt: true },
  },
};
type Shipment = Prisma.ParcelShipmentGetPayload<{
  include: typeof shipmentInclude;
}>;
type Tx = Prisma.TransactionClient;

export function normalizedParcelPhone(value: string) {
  return value.startsWith('0') ? '+234' + value.slice(1) : value;
}
function cityKey(value: string) {
  return value.trim().toLocaleLowerCase('en');
}
function clean(value: string) {
  return value.trim();
}

@Injectable()
export class ParcelService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async tx<T>(work: (db: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(work, {
          isolationLevel: 'Serializable',
          timeout: 15000,
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2034' &&
          attempt < 3
        )
          continue;
        throw e;
      }
    }
  }
  private async verified(db: Tx, userId: string) {
    const user = await db.user.findFirst({
      where: { id: userId, ...activeUser },
      select: { id: true, phone: true },
    });
    if (!user) throw new ForbiddenException('An active account is required');
    return user;
  }
  private async admin(db: Tx, userId: string) {
    await this.verified(db, userId);
    if (
      !(await db.userRole.findFirst({
        where: { userId, role: { name: 'ADMIN' } },
      }))
    )
      throw new ForbiddenException();
  }
  private async agent(db: Tx, userId: string) {
    await this.verified(db, userId);
    const value = await db.parcelAgent.findFirst({
      where: { userId, status: 'APPROVED' },
    });
    if (!value)
      throw new ForbiddenException(
        'Your parcel shop needs operations approval',
      );
    return value;
  }
  private async owned(db: Tx, userId: string, id: string) {
    const user = await this.verified(db, userId);
    const value = await db.parcelShipment.findUnique({
      where: { id },
      include: shipmentInclude,
    });
    if (!value) throw new NotFoundException('Parcel not found');
    const agent = await db.parcelAgent.findFirst({
      where: {
        userId,
        status: 'APPROVED',
        id: { in: [value.originAgentId, value.destinationAgentId] },
      },
    });
    if (value.senderId !== userId && value.recipientId !== userId && !agent)
      throw new NotFoundException('Parcel not found');
    return { value, agent, user };
  }
  private safe(value: Shipment, userId: string, agentId?: string) {
    const {
      codeHash: _hash,
      requestHash: _request,
      codeAttempts: _attempts,
      codeExpiresAt,
      codeIssuedAt: _issued,
      codeIssues: _issues,
      codePurpose: _purpose,
      clientReference: _client,
      recipientId: _recipient,
      ...rest
    } = value;
    void _hash;
    void _request;
    void _attempts;
    void _issued;
    void _issues;
    void _purpose;
    void _client;
    void _recipient;
    return {
      ...rest,
      role:
        value.senderId === userId ? 'sender' : agentId ? 'agent' : 'recipient',
      agentSide:
        agentId === value.originAgentId
          ? 'origin'
          : agentId === value.destinationAgentId
            ? 'destination'
            : null,
      collectionCodeExpiresAt:
        value.senderId === userId ? codeExpiresAt : undefined,
      trackingMode: 'AGENT_CUSTODY_UPDATES',
      paymentAvailability: 'NOT_ENABLED',
    };
  }
  private async audit(
    db: Tx,
    actorId: string,
    action: string,
    resourceId: string,
    reason: string,
    details: Prisma.InputJsonObject = {},
  ) {
    await db.adminOperation.create({
      data: {
        actorId,
        action,
        resourceId,
        reason,
        details: { source: 'parcel-network', ...details },
      },
    });
  }
  private async move(
    db: Tx,
    row: Shipment,
    actorId: string,
    status: ParcelStatus,
    kind: string,
    note: string,
  ) {
    const result = await db.parcelShipment.updateMany({
      where: { id: row.id, version: row.version, status: row.status },
      data: {
        status,
        version: { increment: 1 },
        ...(terminal.includes(status) ||
        ['RETURN_REQUESTED', 'READY_FOR_RETURN'].includes(status)
          ? { codeHash: null, codeExpiresAt: null }
          : {}),
      },
    });
    if (result.count !== 1)
      throw new ConflictException(
        'Parcel changed. Refresh before trying again',
      );
    await db.parcelEvent.create({
      data: { shipmentId: row.id, actorId, kind, status, note },
    });
    return db.parcelShipment.findUniqueOrThrow({
      where: { id: row.id },
      include: shipmentInclude,
    });
  }
  async apply(userId: string, body: ParcelAgentDto) {
    return this.tx(async (db) => {
      await this.verified(db, userId);
      if (await db.parcelAgent.findUnique({ where: { userId } }))
        throw new ConflictException(
          'A parcel shop application already exists. Contact Support to amend it',
        );
      return db.parcelAgent.create({
        data: {
          userId,
          shopName: clean(body.shopName),
          address: clean(body.address),
          state: body.state,
          city: clean(body.city),
          cityKey: cityKey(body.city),
        },
        select: shopSelect,
      });
    });
  }
  async myAgent(userId: string) {
    return this.tx(async (db) => {
      await this.verified(db, userId);
      const value = await db.parcelAgent.findUnique({
        where: { userId },
        select: { ...shopSelect, reviewReference: true },
      });
      const routes = value
        ? await db.parcelRoute.findMany({
            where: { originAgentId: value.id },
            include: routeInclude,
            take: 100,
            orderBy: { createdAt: 'desc' },
          })
        : [];
      return { agent: value, routes };
    });
  }
  async shops(query: ParcelListQuery) {
    return this.db.parcelAgent.findMany({
      where: {
        ...availableAgent,
        ...(query.state ? { state: query.state } : {}),
        ...(query.city ? { cityKey: cityKey(query.city) } : {}),
      },
      select: shopSelect,
      take: 100,
      orderBy: [{ state: 'asc' }, { cityKey: 'asc' }, { id: 'asc' }],
    });
  }
  async propose(userId: string, body: ParcelRouteDto) {
    return this.tx(async (db) => {
      const origin = await this.agent(db, userId);
      if (origin.id === body.destinationAgentId)
        throw new BadRequestException('Choose a different destination shop');
      const destination = await db.parcelAgent.findFirst({
        where: { id: body.destinationAgentId, ...availableAgent },
      });
      if (!destination)
        throw new ConflictException('Destination shop is not available');
      if (!body.homePickup && body.homePickupFeeKobo !== 0)
        throw new BadRequestException(
          'Drop-off routes cannot charge a home pickup fee',
        );
      if (
        (await db.parcelRoute.count({ where: { originAgentId: origin.id } })) >=
        100
      )
        throw new ConflictException('Route limit reached. Contact Operations');
      return db.parcelRoute.create({
        data: { ...body, originAgentId: origin.id },
        include: routeInclude,
      });
    });
  }
  async routes(query: ParcelListQuery) {
    return this.db.parcelRoute.findMany({
      where: {
        status: 'ACTIVE',
        originAgent: {
          ...availableAgent,
          ...(query.state ? { state: query.state } : {}),
          ...(query.city ? { cityKey: cityKey(query.city) } : {}),
        },
        destinationAgent: {
          ...availableAgent,
          ...(query.destinationState ? { state: query.destinationState } : {}),
        },
      },
      include: routeInclude,
      take: 100,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
  async create(userId: string, body: ParcelCreateDto) {
    const data = {
      recipientName: clean(body.recipientName),
      recipientPhone: normalizedParcelPhone(body.recipientPhone),
      description: clean(body.description),
      category: body.category,
      weightGrams: body.weightGrams,
      pickupMode: body.pickupMode,
      pickupAddress:
        body.pickupMode === 'HOME_PICKUP' ? clean(body.pickupAddress!) : null,
    };
    if (
      data.recipientName.length < 2 ||
      data.description.length < 5 ||
      (data.pickupAddress !== null && data.pickupAddress.length < 5)
    )
      throw new BadRequestException('Enter complete parcel details');
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          ...data,
          routeId: body.routeId,
          expectedPriceKobo: body.expectedPriceKobo,
        }),
      )
      .digest('hex');
    const execute = () =>
      this.tx(async (db) => {
        await this.verified(db, userId);
        const previous = await db.parcelShipment.findUnique({
          where: {
            senderId_clientReference: {
              senderId: userId,
              clientReference: body.clientReference,
            },
          },
          include: shipmentInclude,
        });
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new ConflictException(
              'This booking reference was already used for different details',
            );
          return this.safe(previous, userId);
        }
        const route = await db.parcelRoute.findFirst({
          where: {
            id: body.routeId,
            status: 'ACTIVE',
            originAgent: availableAgent,
            destinationAgent: availableAgent,
          },
        });
        if (!route)
          throw new ConflictException('This route is no longer available');
        if (data.weightGrams > route.maxWeightGrams)
          throw new BadRequestException(
            'Parcel exceeds the route weight limit',
          );
        if (data.pickupMode === 'HOME_PICKUP' && !route.homePickup)
          throw new BadRequestException(
            'This route supports shop drop-off only',
          );
        const priceKobo =
          route.priceKobo +
          (data.pickupMode === 'HOME_PICKUP' ? route.homePickupFeeKobo : 0);
        if (priceKobo !== body.expectedPriceKobo)
          throw new ConflictException(
            'Route price changed. Review the current quote',
          );
        if (
          (await db.parcelShipment.count({
            where: {
              senderId: userId,
              createdAt: { gte: new Date(Date.now() - 86400000) },
            },
          })) >= 20
        )
          throw new ConflictException('Daily parcel request limit reached');
        const recipient = await db.user.findFirst({
          // An unverified contact number cannot prove ownership of a recipient account.
          where: {
            phone: data.recipientPhone,
            ...activeUser,
            phoneVerified: true,
          },
          select: { id: true },
        });
        const row = await db.parcelShipment.create({
          data: {
            ...data,
            recipientId: recipient?.id ?? null,
            senderId: userId,
            routeId: route.id,
            originAgentId: route.originAgentId,
            destinationAgentId: route.destinationAgentId,
            clientReference: body.clientReference,
            requestHash,
            priceKobo,
            reference: 'OC-' + randomBytes(8).toString('hex').toUpperCase(),
            events: {
              create: {
                actorId: userId,
                kind: 'REQUESTED',
                status: 'REQUESTED',
                note: 'Parcel request sent. Shop acceptance is required before drop-off or pickup.',
              },
            },
          },
          include: shipmentInclude,
        });
        return this.safe(row, userId);
      });
    try {
      return await execute();
    } catch (e) {
      // A simultaneous retry may hit the unique constraint instead of serialization.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return execute();
      throw e;
    }
  }
  async list(userId: string, query: ParcelListQuery, agentOnly = false) {
    return this.tx(async (db) => {
      await this.verified(db, userId);
      const agent = await db.parcelAgent.findFirst({
        where: { userId, status: 'APPROVED' },
      });
      if (agentOnly && !agent)
        throw new ForbiddenException('Parcel agent approval required');
      const mine: Prisma.ParcelShipmentWhereInput[] = agentOnly
        ? []
        : [{ senderId: userId }, { recipientId: userId }];
      if (agent)
        mine.push(
          { originAgentId: agent.id },
          { destinationAgentId: agent.id },
        );
      const rows = await db.parcelShipment.findMany({
        where: { OR: mine },
        ...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
        include: shipmentInclude,
        take: 50,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return {
        items: rows.map((row) => this.safe(row, userId, agent?.id)),
        nextCursor: rows.length === 50 ? rows[49].id : null,
      };
    });
  }
  async detail(userId: string, id: string) {
    return this.tx(async (db) => {
      const { value, agent } = await this.owned(db, userId, id);
      return this.safe(value, userId, agent?.id);
    });
  }
  async advance(userId: string, id: string, body: ParcelMoveDto) {
    return this.tx(async (db) => {
      const agent = await this.agent(db, userId);
      const { value } = await this.owned(db, userId, id);
      const actions: Record<
        ParcelMoveDto['action'],
        {
          side: 'origin' | 'destination';
          from: ParcelStatus[];
          to: ParcelStatus;
        }
      > = {
        accept: { side: 'origin', from: ['REQUESTED'], to: 'ACCEPTED' },
        receive: { side: 'origin', from: ['ACCEPTED'], to: 'AT_ORIGIN' },
        dispatch: { side: 'origin', from: ['AT_ORIGIN'], to: 'IN_TRANSIT' },
        arrive: {
          side: 'destination',
          from: ['IN_TRANSIT'],
          to: 'READY_FOR_COLLECTION',
        },
        'return-dispatch': {
          side: 'destination',
          from: ['RETURN_REQUESTED'],
          to: 'RETURN_IN_TRANSIT',
        },
        'return-arrive': {
          side: 'origin',
          from: ['RETURN_IN_TRANSIT'],
          to: 'READY_FOR_RETURN',
        },
      };
      const rule = actions[body.action];
      if (
        agent.id !==
        (rule.side === 'origin'
          ? value.originAgentId
          : value.destinationAgentId)
      )
        throw new ForbiddenException(
          'Only the assigned custody shop can record this step',
        );
      if (!rule.from.includes(value.status))
        throw new ConflictException(
          'This step is not available for the current parcel status',
        );
      if (body.note.trim().length < 5)
        throw new BadRequestException('Describe the custody handover');
      const row = await this.move(
        db,
        value,
        userId,
        rule.to,
        body.action.toUpperCase(),
        clean(body.note),
      );
      return this.safe(row, userId, agent.id);
    });
  }
  async cancelOrReturn(
    userId: string,
    id: string,
    reason: string,
    returning: boolean,
  ) {
    return this.tx(async (db) => {
      const { value } = await this.owned(db, userId, id);
      if (value.senderId !== userId)
        throw new ForbiddenException('Only the sender may request this');
      let status: ParcelStatus;
      if (!returning && ['REQUESTED', 'ACCEPTED'].includes(value.status))
        status = 'CANCELLED';
      else if (returning && value.status === 'AT_ORIGIN')
        status = 'READY_FOR_RETURN';
      else if (
        returning &&
        ['IN_TRANSIT', 'READY_FOR_COLLECTION'].includes(value.status)
      )
        status = 'RETURN_REQUESTED';
      else
        throw new ConflictException(
          'This action is unavailable. Contact Support for help',
        );
      return this.safe(
        await this.move(
          db,
          value,
          userId,
          status,
          returning ? 'RETURN_REQUEST' : 'CANCELLED',
          clean(reason),
        ),
        userId,
      );
    });
  }
  private hash(id: string, purpose: string, code: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update('onecall-parcel-v1\0' + id + '\0' + purpose + '\0' + code)
      .digest('hex');
  }
  async issueCode(userId: string, id: string) {
    return this.tx(async (db) => {
      const { value } = await this.owned(db, userId, id);
      if (value.senderId !== userId)
        throw new ForbiddenException(
          'Only the sender can create a collection code',
        );
      const purpose =
        value.status === 'READY_FOR_COLLECTION'
          ? 'DELIVERY'
          : value.status === 'READY_FOR_RETURN'
            ? 'RETURN'
            : null;
      if (!purpose)
        throw new ConflictException(
          'A code is available only when the parcel is ready for collection',
        );
      const sameWindow =
        value.codePurpose === purpose &&
        value.codeIssuedAt &&
        value.codeIssuedAt.getTime() > Date.now() - 86400000;
      if (sameWindow && value.codeIssues >= 3)
        throw new ConflictException(
          'Code issue limit reached. Contact Support',
        );
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const expiresAt = new Date(Date.now() + 86400000);
      const result = await db.parcelShipment.updateMany({
        where: { id, version: value.version },
        data: {
          version: { increment: 1 },
          codeHash: this.hash(id, purpose, code),
          codePurpose: purpose,
          codeAttempts: 0,
          codeExpiresAt: expiresAt,
          codeIssuedAt: sameWindow ? value.codeIssuedAt : new Date(),
          codeIssues: sameWindow ? value.codeIssues + 1 : 1,
        },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'Parcel changed. Refresh before trying again',
        );
      await db.parcelEvent.create({
        data: {
          shipmentId: id,
          actorId: userId,
          kind: 'CODE_ISSUED',
          status: value.status,
          note: 'A collection code was created. Any previous code is invalid.',
        },
      });
      return {
        code,
        expiresAt,
        purpose,
        instruction:
          purpose === 'DELIVERY'
            ? 'Share only with your recipient. Show the code to the destination agent after inspecting the parcel.'
            : 'Show this code to the origin shop after checking your returned parcel.',
      };
    });
  }
  async collect(userId: string, id: string, code: string) {
    const result = await this.tx(async (db) => {
      const agent = await this.agent(db, userId);
      const { value } = await this.owned(db, userId, id);
      const purpose =
        value.status === 'READY_FOR_COLLECTION'
          ? 'DELIVERY'
          : value.status === 'READY_FOR_RETURN'
            ? 'RETURN'
            : null;
      if (!purpose)
        throw new ConflictException('Parcel is not awaiting collection');
      const expectedAgent =
        purpose === 'DELIVERY' ? value.destinationAgentId : value.originAgentId;
      if (agent.id !== expectedAgent)
        throw new ForbiddenException(
          'Only the collection shop can confirm handover',
        );
      if (
        value.codePurpose !== purpose ||
        !value.codeHash ||
        !value.codeExpiresAt ||
        value.codeExpiresAt.getTime() <= Date.now() ||
        value.codeAttempts >= 5
      )
        return { error: true as const };
      const matches = timingSafeEqual(
        Buffer.from(value.codeHash, 'hex'),
        Buffer.from(this.hash(id, purpose, code), 'hex'),
      );
      if (!matches) {
        await db.parcelShipment.update({
          where: { id },
          data: { codeAttempts: { increment: 1 }, version: { increment: 1 } },
        });
        await db.parcelEvent.create({
          data: {
            shipmentId: id,
            actorId: userId,
            kind: 'COLLECTION_REJECTED',
            status: value.status,
            note: 'Collection code was not accepted.',
          },
        });
        return { error: true as const };
      }
      return {
        row: this.safe(
          await this.move(
            db,
            value,
            userId,
            purpose === 'DELIVERY' ? 'DELIVERED' : 'RETURNED',
            'COLLECTED',
            purpose === 'DELIVERY'
              ? 'Destination shop confirmed recipient collection using the collection code.'
              : 'Origin shop confirmed return collection using the return code.',
          ),
          userId,
          agent.id,
        ),
      };
    });
    // Throw after the transaction commits so failed attempts are not rolled back.
    if ('error' in result)
      throw new BadRequestException(
        'Code is invalid, expired or locked. Ask the sender to check or replace it',
      );
    return result.row;
  }
  async support(userId: string, id: string, reason: string) {
    return this.tx(async (db) => {
      const { value } = await this.owned(db, userId, id);
      const subject = 'Parcel support: ' + value.reference;
      if (
        (await db.supportTicket.count({
          where: {
            userId,
            subject,
            createdAt: { gte: new Date(Date.now() - 86400000) },
          },
        })) >= 3
      )
        throw new ConflictException(
          'Your parcel support request is already recorded. View Support for updates',
        );
      const ticket = await db.supportTicket.create({
        data: { userId, subject, message: clean(reason) },
      });
      return { id: ticket.id, status: ticket.status };
    });
  }
  async adminList(userId: string) {
    return this.tx(async (db) => {
      await this.admin(db, userId);
      return {
        agents: await db.parcelAgent.findMany({
          select: { ...shopSelect, userId: true, reviewReference: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        routes: await db.parcelRoute.findMany({
          include: routeInclude,
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        shipments: await db.parcelShipment.findMany({
          select: {
            id: true,
            reference: true,
            status: true,
            priceKobo: true,
            createdAt: true,
            ...routeInclude,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      };
    });
  }
  async adminDetail(userId: string, id: string, reason: string) {
    return this.tx(async (db) => {
      await this.admin(db, userId);
      const row = await db.parcelShipment.findUnique({
        where: { id },
        include: shipmentInclude,
      });
      if (!row) throw new NotFoundException();
      await this.audit(db, userId, 'PARCEL_PRIVATE_VIEW', id, reason);
      return this.safe(row, userId);
    });
  }
  async reviewAgent(userId: string, id: string, body: ParcelReviewDto) {
    return this.tx(async (db) => {
      await this.admin(db, userId);
      const agent = await db.parcelAgent.findUnique({ where: { id } });
      if (!agent) throw new NotFoundException();
      if (agent.userId === userId)
        throw new ForbiddenException(
          'A separate administrator must review your shop',
        );
      if (body.approved) await this.verified(db, agent.userId);
      await this.audit(
        db,
        userId,
        body.approved ? 'PARCEL_AGENT_APPROVE' : 'PARCEL_AGENT_SUSPEND',
        id,
        body.reason,
      );
      return db.parcelAgent.update({
        where: { id },
        data: {
          status: body.approved ? 'APPROVED' : 'SUSPENDED',
          reviewReference: body.reviewReference.trim(),
          reviewedAt: new Date(),
        },
        select: shopSelect,
      });
    });
  }
  async reviewRoute(userId: string, id: string, body: ParcelRouteReviewDto) {
    const { active, reason } = body;
    if (
      active &&
      ![
        body.shopsConfirmed,
        body.pricingConfirmed,
        body.custodyConfirmed,
        body.restrictionsConfirmed,
      ].every((v) => v === true)
    )
      throw new BadRequestException(
        'Complete the independent parcel route review checklist',
      );
    return this.tx(async (db) => {
      await this.admin(db, userId);
      const route = await db.parcelRoute.findUnique({
        where: { id },
        include: { originAgent: true, destinationAgent: true },
      });
      if (!route) throw new NotFoundException();
      if (
        [route.originAgent.userId, route.destinationAgent.userId].includes(
          userId,
        )
      )
        throw new ForbiddenException(
          'A separate administrator must review your route',
        );
      if (
        active &&
        (await db.parcelAgent.count({
          where: {
            id: { in: [route.originAgentId, route.destinationAgentId] },
            ...availableAgent,
          },
        })) !== 2
      )
        throw new ConflictException(
          'Both shops must be approved and have active accounts',
        );
      await this.audit(
        db,
        userId,
        active ? 'PARCEL_ROUTE_ACTIVATE' : 'PARCEL_ROUTE_PAUSE',
        id,
        reason,
        {
          routeId: id,
          originAgentId: route.originAgentId,
          destinationAgentId: route.destinationAgentId,
          priceKobo: route.priceKobo,
          homePickupFeeKobo: route.homePickupFeeKobo,
          maxWeightGrams: route.maxWeightGrams,
          estimatedHours: route.estimatedHours,
          ...(active
            ? {
                shopsConfirmed: true,
                pricingConfirmed: true,
                custodyConfirmed: true,
                restrictionsConfirmed: true,
              }
            : {}),
        },
      );
      return db.parcelRoute.update({
        where: { id },
        data: { status: active ? 'ACTIVE' : 'PAUSED' },
        include: routeInclude,
      });
    });
  }
}
