import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Server } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/bootstrap/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';
import { PrismaService } from '../src/infrastructure/database/prisma';
import { AuthService } from '../src/modules/auth/auth.service';

type Actor = { id: string; phone: string; token: string };
describe('Parcel network: permissions, custody and private collection codes', () => {
  let app: INestApplication<Server>, db: PrismaService;
  let admin: Actor,
    sender: Actor,
    recipient: Actor,
    origin: Actor,
    destination: Actor,
    stranger: Actor;
  let originId: string, destinationId: string, routeId: string;
  const actors: Actor[] = [];
  const reason = 'Physical shop and custody arrangements reviewed';
  const stamp = randomBytes(6).toString('hex');
  function call(actor: Actor, method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())
      [method]('/api/v1' + path)
      .set('Authorization', 'Bearer ' + actor.token);
  }
  async function account(): Promise<Actor> {
    const n = actors.length;
    const user = await db.user.create({
      data: {
        uid: String(
          1000000000 +
            Number(BigInt('0x' + randomBytes(5).toString('hex')) % 9000000000n),
        ),
        email: `parcel-${stamp}-${n}@example.com`,
        phone:
          '+2348' +
          String(
            100000000 +
              Number(
                BigInt('0x' + randomBytes(4).toString('hex')) % 900000000n,
              ),
          ),
        firstName: 'Parcel',
        lastName: 'Test',
        passwordHash: await argon2.hash('ParcelTests2026!'),
        status: 'ACTIVE',
        emailVerified: false,
        phoneVerified: false,
      },
    });
    const result = await app
      .get(AuthService)
      .login({ email: user.email, password: 'ParcelTests2026!' });
    const actor = { id: user.id, phone: user.phone, token: result.accessToken };
    actors.push(actor);
    return actor;
  }
  const routeBody = () => ({
    destinationAgentId: destinationId,
    priceKobo: 250000,
    maxWeightGrams: 10000,
    estimatedHours: 24,
    homePickup: true,
    homePickupFeeKobo: 50000,
  });
  const reviewChecks = {
    shopsConfirmed: true,
    pricingConfirmed: true,
    custodyConfirmed: true,
    restrictionsConfirmed: true,
  };
  const parcelBody = () => ({
    routeId,
    clientReference: randomUUID(),
    recipientName: 'Recipient Test',
    recipientPhone: recipient.phone,
    description: 'Two safely packed cotton shirts',
    category: 'TEXTILES',
    weightGrams: 1000,
    pickupMode: 'SHOP_DROP_OFF',
    permittedItemsConfirmed: true,
    quoteAccepted: true,
    expectedPriceKobo: 250000,
  });
  async function create() {
    return (
      await call(sender, 'post', '/parcels').send(parcelBody()).expect(201)
    ).body as { id: string };
  }
  async function move(
    actor: Actor,
    id: string,
    action: string,
    expected = 201,
  ) {
    return call(actor, 'post', `/parcels/${id}/move`)
      .send({ action, note: 'Verified physical custody handover at the shop' })
      .expect(expected);
  }
  async function ready() {
    const { id } = await create();
    await move(origin, id, 'accept');
    await move(origin, id, 'receive');
    await move(origin, id, 'dispatch');
    await move(destination, id, 'arrive');
    return id;
  }
  beforeAll(async () => {
    if (process.env.ONECALL_ALLOW_TEST_DATABASE !== 'true')
      throw new Error('Disposable database required');
    app = await NestFactory.create<INestApplication<Server>>(AppModule, {
      logger: false,
    });
    configureApplication(app);
    await app.init();
    db = app.get(PrismaService);
    admin = await account();
    sender = await account();
    recipient = await account();
    await db.user.update({
      where: { id: recipient.id },
      data: { phoneVerified: true },
    });
    origin = await account();
    destination = await account();
    stranger = await account();
    const role = await db.role.upsert({
      where: { name: 'ADMIN' },
      create: { name: 'ADMIN' },
      update: {},
    });
    await db.userRole.create({ data: { userId: admin.id, roleId: role.id } });
    for (const [actor, city, state] of [
      [origin, 'Kaduna', 'Kaduna'],
      [destination, 'Kano', 'Kano'],
    ] as const) {
      const shop = await call(actor, 'post', '/parcels/agent/apply')
        .send({
          shopName: `${city} Test Shop`,
          address: 'Test motor park shop 12',
          state,
          city,
        })
        .expect(201);
      await call(
        admin,
        'post',
        `/admin/parcels/agents/${(shop.body as { id: string }).id}/review`,
      )
        .send({
          approved: true,
          reviewReference: 'Synthetic-test-check',
          reason,
        })
        .expect(201);
      if (actor === origin) originId = (shop.body as { id: string }).id;
      else destinationId = (shop.body as { id: string }).id;
    }
    const route = await call(origin, 'post', '/parcels/agent/routes')
      .send(routeBody())
      .expect(201);
    routeId = (route.body as { id: string }).id;
    await call(admin, 'post', `/admin/parcels/routes/${routeId}/review`)
      .send({ active: true, reason, ...reviewChecks })
      .expect(201);
  });
  afterAll(async () => {
    if (db && actors.length) {
      const ids = actors.map((a) => a.id);
      const ships = (
        await db.parcelShipment.findMany({
          where: { senderId: { in: ids } },
          select: { id: true },
        })
      ).map((s) => s.id);
      await db.parcelEvent.deleteMany({ where: { shipmentId: { in: ships } } });
      await db.parcelShipment.deleteMany({ where: { id: { in: ships } } });
      await db.parcelRoute.deleteMany({
        where: { originAgent: { userId: { in: ids } } },
      });
      await db.parcelAgent.deleteMany({ where: { userId: { in: ids } } });
      await db.supportTicket.deleteMany({ where: { userId: { in: ids } } });
      await db.adminOperation.deleteMany({ where: { actorId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  });
  it('allows unverified active customers but enforces authentication, suspension and agent approval', async () => {
    await request(app.getHttpServer()).get('/api/v1/parcels').expect(401);
    await db.user.update({
      where: { id: stranger.id },
      data: { emailVerified: false },
    });
    await call(stranger, 'get', '/parcels/routes').expect(200);
    await db.user.update({
      where: { id: stranger.id },
      data: { status: 'SUSPENDED' },
    });
    await call(stranger, 'get', '/parcels/routes').expect(401);
    await db.user.update({
      where: { id: stranger.id },
      data: { status: 'ACTIVE', emailVerified: false },
    });
    await call(stranger, 'get', '/admin/parcels').expect(403);
    await call(stranger, 'post', '/parcels/agent/routes')
      .send(routeBody())
      .expect(403);
  });
  it('requires a complete independent route review and preserves the reviewed quote', async () => {
    const proposed = await call(origin, 'post', '/parcels/agent/routes')
      .send(routeBody())
      .expect(201);
    const id = (proposed.body as { id: string }).id;
    await call(admin, 'post', `/admin/parcels/routes/${id}/review`)
      .send({ active: true, reason })
      .expect(400);
    for (const key of Object.keys(reviewChecks)) {
      await call(admin, 'post', `/admin/parcels/routes/${id}/review`)
        .send({ active: true, reason, ...reviewChecks, [key]: false })
        .expect(400);
    }
    await call(origin, 'post', `/admin/parcels/routes/${id}/review`)
      .send({ active: true, reason, ...reviewChecks })
      .expect(403);
    expect(
      (await db.parcelRoute.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('PENDING');
    await call(admin, 'post', `/admin/parcels/routes/${id}/review`)
      .send({ active: true, reason, ...reviewChecks })
      .expect(201);
    const audit = await db.adminOperation.findFirstOrThrow({
      where: { resourceId: id, action: 'PARCEL_ROUTE_ACTIVATE' },
    });
    expect(audit.details).toMatchObject({
      ...reviewChecks,
      priceKobo: 250000,
      originAgentId: originId,
      destinationAgentId: destinationId,
    });
    await call(admin, 'post', `/admin/parcels/routes/${id}/review`)
      .send({ active: false, reason })
      .expect(201);
  });
  it('lists real available routes with scoped shop details and catalogue availability', async () => {
    const result = await call(
      sender,
      'get',
      '/parcels/routes?state=Kaduna&city=kaduna&destinationState=Kano',
    ).expect(200);
    expect(
      (result.body as { id: string }[]).some((r) => r.id === routeId),
    ).toBe(true);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(result.body)).not.toContain('reviewReference');
    expect(JSON.stringify(result.body)).not.toContain('userId');
    const empty = await call(
      sender,
      'get',
      '/parcels/routes?state=Bayelsa',
    ).expect(200);
    expect(empty.body).toEqual([]);
    const catalogue = await request(app.getHttpServer())
      .get('/api/v1/services?state=Kaduna&city=Kaduna')
      .expect(200);
    expect(
      (
        catalogue.body as {
          services: { key: string; availableProviders: number }[];
        }
      ).services.find((s) => s.key === 'parcel-delivery')!.availableProviders,
    ).toBeGreaterThanOrEqual(1);
  });
  it('prevents self approval, role injection and unreviewed route publication', async () => {
    await call(stranger, 'post', '/parcels/agent/apply')
      .send({
        shopName: '    ',
        address: 'Synthetic address',
        state: 'Kaduna',
        city: 'Kaduna',
      })
      .expect(400);
    await call(admin, 'post', `/admin/parcels/routes/${routeId}/review`)
      .send({ active: true, reason: '             ' })
      .expect(400);
    const result = await call(admin, 'post', '/parcels/agent/apply')
      .send({
        shopName: 'Admin Test Shop',
        address: 'Synthetic shop address',
        state: 'Kaduna',
        city: 'Kaduna',
      })
      .expect(201);
    await call(
      admin,
      'post',
      `/admin/parcels/agents/${(result.body as { id: string }).id}/review`,
    )
      .send({ approved: true, reviewReference: 'self-check', reason })
      .expect(403);
    await call(stranger, 'post', '/parcels/agent/apply')
      .send({
        shopName: 'Untrusted shop',
        address: 'Synthetic address',
        state: 'Kaduna',
        city: 'Kaduna',
        status: 'APPROVED',
      })
      .expect(400);
    const route = await call(origin, 'post', '/parcels/agent/routes')
      .send({ ...routeBody(), priceKobo: 300000 })
      .expect(201);
    const list = await call(sender, 'get', '/parcels/routes').expect(200);
    expect(
      (list.body as { id: string }[]).some(
        (r) => r.id === (route.body as { id: string }).id,
      ),
    ).toBe(false);
  });
  it('validates authoritative quotes, capacity, prohibited-item consent and extra fields', async () => {
    for (const override of [
      { expectedPriceKobo: 100 },
      { weightGrams: 10001 },
      { permittedItemsConfirmed: false },
      { quoteAccepted: false },
      { status: 'DELIVERED' },
      { category: 'WEAPONS' },
    ]) {
      const res = await call(sender, 'post', '/parcels').send({
        ...parcelBody(),
        ...override,
      });
      expect([400, 409]).toContain(res.status);
    }
    await call(origin, 'post', '/parcels/agent/routes')
      .send({ ...routeBody(), destinationAgentId: originId })
      .expect(400);
  });
  it('reuses an identical booking reference and rejects changed retry details', async () => {
    const body = parcelBody();
    const first = await call(sender, 'post', '/parcels').send(body).expect(201);
    const retry = await call(sender, 'post', '/parcels').send(body).expect(201);
    expect((first.body as { id: string }).id).toBe(
      (retry.body as { id: string }).id,
    );
    expect(JSON.stringify(first.body)).not.toContain('requestHash');
    await call(sender, 'post', '/parcels')
      .send({ ...body, description: 'Changed parcel contents' })
      .expect(409);
  });
  it('makes simultaneous booking retries a single shipment', async () => {
    const body = parcelBody();
    const results = await Promise.all([
      call(sender, 'post', '/parcels').send(body),
      call(sender, 'post', '/parcels').send(body),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect((results[0].body as { id: string }).id).toBe(
      (results[1].body as { id: string }).id,
    );
    expect(
      await db.parcelShipment.count({
        where: { senderId: sender.id, clientReference: body.clientReference },
      }),
    ).toBe(1);
  });
  it('normalizes recipient phones and prevents unauthorized detail, list and code access', async () => {
    const body = {
      ...parcelBody(),
      recipientPhone: '0' + recipient.phone.slice(4),
    };
    const result = await call(sender, 'post', '/parcels')
      .send(body)
      .expect(201);
    const id = (result.body as { id: string }).id;
    const detail = await call(recipient, 'get', `/parcels/${id}`).expect(200);
    expect((detail.body as { role: string }).role).toBe('recipient');
    const list = await call(stranger, 'get', '/parcels').expect(200);
    expect(
      (list.body as { items: { id: string }[] }).items.some((p) => p.id === id),
    ).toBe(false);
    await call(stranger, 'get', `/parcels/${id}`).expect(404);
    await call(stranger, 'post', `/parcels/${id}/support`)
      .send({ reason })
      .expect(404);
    await call(recipient, 'post', `/parcels/${id}/collection-code`)
      .send({})
      .expect(403);
    await call(sender, 'post', `/parcels/${id}/collection-code`)
      .send({})
      .expect(409);
  });
  it('does not expose historic parcels when a phone number moves to another account', async () => {
    const { id } = await create();
    const previousPhone = stranger.phone;
    const temporaryPhone = '+234900' + String(Date.now()).slice(-7);
    await db.user.update({
      where: { id: recipient.id },
      data: { phone: temporaryPhone },
    });
    try {
      await db.user.update({
        where: { id: stranger.id },
        data: { phone: recipient.phone },
      });
      await call(stranger, 'get', `/parcels/${id}`).expect(404);
      await call(recipient, 'get', `/parcels/${id}`).expect(200);
      const list = await call(stranger, 'get', '/parcels').expect(200);
      expect(
        (list.body as { items: { id: string }[] }).items.some(
          (p) => p.id === id,
        ),
      ).toBe(false);
    } finally {
      await db.user.update({
        where: { id: stranger.id },
        data: { phone: previousPhone },
      });
      await db.user.update({
        where: { id: recipient.id },
        data: { phone: recipient.phone },
      });
    }
  });
  it('restricts custody actions to the assigned side and disallows skipped/repeated stages', async () => {
    const { id } = await create();
    await move(sender, id, 'accept', 403);
    await move(destination, id, 'accept', 403);
    await move(origin, id, 'dispatch', 409);
    const results = await Promise.all([
      call(origin, 'post', `/parcels/${id}/move`).send({
        action: 'accept',
        note: reason,
      }),
      call(origin, 'post', `/parcels/${id}/move`).send({
        action: 'accept',
        note: reason,
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await db.parcelEvent.count({
        where: { shipmentId: id, status: 'ACCEPTED' },
      }),
    ).toBe(1);
    await move(origin, id, 'receive');
    await call(sender, 'post', `/parcels/${id}/cancel`)
      .send({ reason })
      .expect(409);
  });
  it('collects only at the correct shop with a private code, then rejects replay', async () => {
    const id = await ready();
    const issued = await call(sender, 'post', `/parcels/${id}/collection-code`)
      .send({})
      .expect(201);
    const code = (issued.body as { code: string }).code;
    expect(code).toMatch(/^\d{6}$/);
    const agentDetail = await call(destination, 'get', `/parcels/${id}`).expect(
      200,
    );
    expect(JSON.stringify(agentDetail.body)).not.toContain(code);
    expect(JSON.stringify(agentDetail.body)).not.toContain('codeHash');
    await call(origin, 'post', `/parcels/${id}/collect`)
      .send({ code })
      .expect(403);
    const collect = await call(destination, 'post', `/parcels/${id}/collect`)
      .send({ code })
      .expect(201);
    expect((collect.body as { status: string }).status).toBe('DELIVERED');
    await call(destination, 'post', `/parcels/${id}/collect`)
      .send({ code })
      .expect(409);
    expect(
      (await db.parcelShipment.findUniqueOrThrow({ where: { id } })).codeHash,
    ).toBeNull();
  });
  it('commits wrong attempts, locks after five and supports bounded code rotation', async () => {
    const id = await ready();
    const issued = await call(sender, 'post', `/parcels/${id}/collection-code`)
      .send({})
      .expect(201);
    const code = (issued.body as { code: string }).code;
    const wrong = code === '000000' ? '999999' : '000000';
    for (let n = 0; n < 5; n++)
      await call(destination, 'post', `/parcels/${id}/collect`)
        .send({ code: wrong })
        .expect(400);
    expect(
      (await db.parcelShipment.findUniqueOrThrow({ where: { id } }))
        .codeAttempts,
    ).toBe(5);
    await call(destination, 'post', `/parcels/${id}/collect`)
      .send({ code })
      .expect(400);
    const next = await call(sender, 'post', `/parcels/${id}/collection-code`)
      .send({})
      .expect(201);
    await call(sender, 'post', `/parcels/${id}/collection-code`)
      .send({})
      .expect(201);
    await call(sender, 'post', `/parcels/${id}/collection-code`)
      .send({})
      .expect(409);
    expect((next.body as { code: string }).code).toMatch(/^\d{6}$/);
  });
  it('rejects expired codes', async () => {
    const id = await ready();
    const code = (
      (
        await call(sender, 'post', `/parcels/${id}/collection-code`)
          .send({})
          .expect(201)
      ).body as { code: string }
    ).code;
    await db.parcelShipment.update({
      where: { id },
      data: { codeExpiresAt: new Date(Date.now() - 1000) },
    });
    await call(destination, 'post', `/parcels/${id}/collect`)
      .send({ code })
      .expect(400);
  });
  it('returns parcels with a separate sender code and auditable custody history', async () => {
    const id = await ready();
    await call(sender, 'post', `/parcels/${id}/collection-code`)
      .send({})
      .expect(201);
    await call(sender, 'post', `/parcels/${id}/return`)
      .send({ reason })
      .expect(201);
    expect(
      (await db.parcelShipment.findUniqueOrThrow({ where: { id } })).codeHash,
    ).toBeNull();
    await move(destination, id, 'return-dispatch');
    await move(origin, id, 'return-arrive');
    const code = (
      await call(sender, 'post', `/parcels/${id}/collection-code`)
        .send({})
        .expect(201)
    ).body as { code: string; purpose: string };
    expect(code.purpose).toBe('RETURN');
    await call(destination, 'post', `/parcels/${id}/collect`)
      .send({ code: code.code })
      .expect(403);
    const result = await call(origin, 'post', `/parcels/${id}/collect`)
      .send({ code: code.code })
      .expect(201);
    expect((result.body as { status: string }).status).toBe('RETURNED');
  });
  it('cancels only before custody and records a linked support request', async () => {
    const { id } = await create();
    await call(recipient, 'post', `/parcels/${id}/cancel`)
      .send({ reason })
      .expect(403);
    await call(sender, 'post', `/parcels/${id}/cancel`)
      .send({ reason })
      .expect(201);
    await move(origin, id, 'accept', 409);
    const result = await call(sender, 'post', `/parcels/${id}/support`)
      .send({ reason })
      .expect(201);
    expect((result.body as { status: string }).status).toBe('OPEN');
  });
  it('suspends route availability and custody permission without deleting existing parcels', async () => {
    const { id } = await create();
    await call(admin, 'post', `/admin/parcels/agents/${originId}/review`)
      .send({
        approved: false,
        reviewReference: 'Synthetic-suspension',
        reason,
      })
      .expect(201);
    expect(
      (
        (await call(sender, 'get', '/parcels/routes?state=Kaduna').expect(200))
          .body as { id: string }[]
      ).some((r) => r.id === routeId),
    ).toBe(false);
    await call(sender, 'post', '/parcels').send(parcelBody()).expect(409);
    await move(origin, id, 'accept', 403);
    await call(sender, 'get', `/parcels/${id}`).expect(200);
    await call(admin, 'post', `/admin/parcels/agents/${originId}/review`)
      .send({
        approved: true,
        reviewReference: 'Synthetic-reinstatement',
        reason,
      })
      .expect(201);
  });
  it('requires and audits admin private views without exposing codes', async () => {
    const { id } = await create();
    await call(stranger, 'post', `/admin/parcels/shipments/${id}/view`)
      .send({ reason })
      .expect(403);
    await call(admin, 'post', `/admin/parcels/shipments/${id}/view`)
      .send({ reason: 'short' })
      .expect(400);
    const detail = await call(
      admin,
      'post',
      `/admin/parcels/shipments/${id}/view`,
    )
      .send({ reason })
      .expect(201);
    expect(JSON.stringify(detail.body)).not.toContain('codeHash');
    expect(
      await db.adminOperation.count({
        where: {
          actorId: admin.id,
          resourceId: id,
          action: 'PARCEL_PRIVATE_VIEW',
        },
      }),
    ).toBe(1);
  });
});
