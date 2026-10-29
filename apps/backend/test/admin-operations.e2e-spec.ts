import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/bootstrap/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';
import { PrismaService } from '../src/infrastructure/database/prisma';
import { AuthService } from '../src/modules/auth/auth.service';

describe('Admin provider and booking operations: real HTTP/database', () => {
  let app: INestApplication<Server>, prisma: PrismaService, auth: AuthService;
  type Actor = { id: string; token: string };
  let admin: Actor, customer: Actor, provider: Actor, otherProvider: Actor;
  let providerId: string, otherProviderId: string;
  const stamp = randomBytes(5).toString('hex');
  let sequence = 0;
  const reason = 'Reviewed local test operation';
  async function account(): Promise<Actor> {
    const user = await prisma.user.create({
      data: {
        uid: String(
          (BigInt('0x' + randomBytes(5).toString('hex')) % 9000000000n) +
            1000000000n,
        ),
        email: 'admin-ops-' + stamp + '-' + ++sequence + '@example.com',
        phone:
          '+2348' +
          String(Date.now()).slice(-7) +
          String(sequence).padStart(2, '0'),
        firstName: 'Operations',
        lastName: 'Test',
        passwordHash: await argon2.hash('Operations2026!'),
        status: 'ACTIVE',
        emailVerified: true,
        phoneVerified: false,
      },
    });
    return {
      id: user.id,
      token: (
        await auth.login({ email: user.email, password: 'Operations2026!' })
      ).accessToken,
    };
  }
  function call(actor: Actor, method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())
      [method]('/api/v1' + path)
      .set('Authorization', 'Bearer ' + actor.token);
  }
  async function order(owner = customer) {
    const result = await call(owner, 'post', '/orders')
      .send({
        serviceName: 'Plumbing',
        state: 'Kaduna',
        city: 'Kaduna',
        address: 'Private test street',
      })
      .expect(201);
    return (result.body as { id: string }).id;
  }
  beforeAll(async () => {
    if (process.env.ONECALL_ALLOW_TEST_DATABASE !== 'true')
      throw new Error('Disposable database required');
    app = await NestFactory.create<INestApplication<Server>>(AppModule, {
      logger: false,
    });
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    admin = await account();
    customer = await account();
    provider = await account();
    otherProvider = await account();
    const role = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      create: { name: 'ADMIN' },
      update: {},
    });
    await prisma.userRole.create({
      data: { userId: admin.id, roleId: role.id },
    });
    providerId = (
      await prisma.provider.create({ data: { userId: provider.id } })
    ).id;
    otherProviderId = (
      await prisma.provider.create({ data: { userId: otherProvider.id } })
    ).id;
  });
  afterAll(async () => {
    if (prisma && admin && customer && provider && otherProvider) {
      const ids = [admin.id, customer.id, provider.id, otherProvider.id];
      const rows = await prisma.order.findMany({
        where: { customerId: { in: ids } },
        select: { id: true },
      });
      const orderIds = rows.map((row) => row.id);
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.checkoutIntent.deleteMany({
        where: { userId: { in: ids } },
      });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.adminOperation.deleteMany({
        where: { actorId: { in: ids } },
      });
      await prisma.provider.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  });
  it('denies anonymous, customer and provider access and cannot grant admin through request data', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/operations/providers')
      .expect(401);
    await call(customer, 'get', '/admin/operations/providers').expect(403);
    await call(
      provider,
      'post',
      '/admin/operations/providers/' + providerId + '/approve',
    )
      .send({
        state: 'Kaduna',
        city: 'Kaduna',
        services: ['plumbing'],
        reason,
        role: 'ADMIN',
      })
      .expect(403);
  });
  it('validates coverage and rejects suspended accounts without audit or approval writes', async () => {
    await call(
      admin,
      'post',
      '/admin/operations/providers/' + providerId + '/approve',
    )
      .send({
        state: 'Kaduna',
        city: 'Kaduna',
        services: ['fake-service'],
        reason,
      })
      .expect(400);
    await prisma.user.update({
      where: { id: provider.id },
      data: { status: 'SUSPENDED', emailVerified: false },
    });
    await call(
      admin,
      'post',
      '/admin/operations/providers/' + providerId + '/approve',
    )
      .send({ state: 'Kaduna', city: 'Kaduna', services: ['plumbing'], reason })
      .expect(409);
    expect(
      await prisma.adminOperation.count({ where: { resourceId: providerId } }),
    ).toBe(0);
    await prisma.user.update({
      where: { id: provider.id },
      data: { status: 'ACTIVE', emailVerified: false, phoneVerified: false },
    });
  });
  it('replaces proposed coverage with reviewed coverage and records actor/reason', async () => {
    await prisma.providerCoverage.create({
      data: {
        providerId,
        state: 'Lagos',
        cityKey: '*',
        serviceName: 'Electrical',
      },
    });
    await call(
      admin,
      'post',
      '/admin/operations/providers/' + providerId + '/approve',
    )
      .send({ state: 'Kaduna', city: 'Kaduna', services: ['plumbing'], reason })
      .expect(201);
    expect(
      await prisma.providerCoverage.findMany({
        where: { providerId },
        select: { state: true, cityKey: true, serviceName: true },
      }),
    ).toEqual([
      { state: 'Kaduna', cityKey: 'kaduna', serviceName: 'Plumbing' },
    ]);
    const event = await prisma.adminOperation.findFirstOrThrow({
      where: { resourceId: providerId },
    });
    expect(event.actorId).toBe(admin.id);
    expect(event.reason).toBe(reason);
  });
  it('rejects out-of-area and self assignment', async () => {
    const id = await order();
    await call(
      admin,
      'post',
      '/admin/operations/providers/' + otherProviderId + '/approve',
    )
      .send({ state: 'Lagos', city: 'Ikeja', services: ['plumbing'], reason })
      .expect(201);
    await call(admin, 'post', '/admin/operations/bookings/' + id + '/assign')
      .send({ providerId: otherProviderId, reason })
      .expect(409);
    const own = await order(provider);
    await call(admin, 'post', '/admin/operations/bookings/' + own + '/assign')
      .send({ providerId, reason })
      .expect(409);
  });
  it('one concurrent admin/provider assignment wins; quote gates and customer visibility remain enforced', async () => {
    const id = await order();
    const outcomes = await Promise.all([
      call(admin, 'post', '/admin/operations/bookings/' + id + '/assign').send({
        providerId,
        reason,
      }),
      call(provider, 'post', '/orders/' + id + '/accept').send({}),
    ]);
    expect(outcomes.filter((r) => r.status === 201)).toHaveLength(1);
    expect(outcomes.filter((r) => [404, 409].includes(r.status))).toHaveLength(
      1,
    );
    const row = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(row.providerId).toBe(providerId);
    expect(row.status).toBe('ACCEPTED');
    await call(provider, 'post', '/orders/' + id + '/start')
      .send({})
      .expect(409);
    const visible = await call(customer, 'get', '/orders/' + id).expect(200);
    expect((visible.body as { status: string }).status).toBe('ACCEPTED');
    await call(
      admin,
      'post',
      '/admin/operations/providers/' + providerId + '/revoke',
    )
      .send({ reason })
      .expect(409);
  });
  it('admin assignment writes one history event and notifies both parties', async () => {
    const id = await order();
    await call(admin, 'post', '/admin/operations/bookings/' + id + '/assign')
      .send({ providerId, reason })
      .expect(201);
    await call(admin, 'post', '/admin/operations/bookings/' + id + '/assign')
      .send({ providerId, reason })
      .expect(409);
    expect(
      await prisma.adminOperation.count({
        where: { resourceId: id, action: 'BOOKING_ASSIGNED' },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { orderId: id, title: 'Provider assigned' },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { orderId: id, title: 'Booking assigned' },
      }),
    ).toBe(1);
  });
  it('cancellation clears tracking, becomes visible and cannot repeat or cancel completed jobs', async () => {
    const id = await order();
    await call(admin, 'post', '/admin/operations/bookings/' + id + '/assign')
      .send({ providerId, reason })
      .expect(201);
    await prisma.orderLocation.create({
      data: { orderId: id, latitude: 10.5, longitude: 7.4, accuracy: 10 },
    });
    await call(admin, 'post', '/admin/operations/bookings/' + id + '/cancel')
      .send({ reason })
      .expect(201);
    await call(admin, 'post', '/admin/operations/bookings/' + id + '/cancel')
      .send({ reason })
      .expect(409);
    expect(await prisma.orderLocation.count({ where: { orderId: id } })).toBe(
      0,
    );
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('CANCELLED');
    const done = await order();
    await prisma.order.update({
      where: { id: done },
      data: { status: 'COMPLETED' },
    });
    await call(admin, 'post', '/admin/operations/bookings/' + done + '/cancel')
      .send({ reason })
      .expect(409);
  });
  it('pending payment blocks cancellation without a cancellation audit', async () => {
    const id = await order();
    await prisma.payment.create({
      data: {
        orderId: id,
        amount: '1000',
        status: 'PENDING',
        currency: 'NGN',
        idempotencyKey: 'admin-' + id,
      },
    });
    await call(admin, 'post', '/admin/operations/bookings/' + id + '/cancel')
      .send({ reason })
      .expect(409);
    expect(
      await prisma.adminOperation.count({ where: { resourceId: id } }),
    ).toBe(0);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('PENDING');
  });
  it('search, detail and query validation work; page results disclose no password/session fields', async () => {
    const id = await order();
    const result = await call(
      admin,
      'get',
      '/admin/operations/bookings?q=' + id,
    ).expect(200);
    expect((result.body as { total: number }).total).toBe(1);
    const detail = await call(
      admin,
      'get',
      '/admin/operations/bookings/' + id,
    ).expect(200);
    expect(
      (detail.body as { booking: { address: string } }).booking.address,
    ).toBe('Private test street');
    await call(admin, 'get', '/admin/operations/providers?page=0').expect(400);
    await call(admin, 'get', '/admin/operations/bookings?status=FAKE').expect(
      400,
    );
    const providers = await call(
      admin,
      'get',
      '/admin/operations/providers',
    ).expect(200);
    expect(JSON.stringify(providers.body)).not.toMatch(
      /passwordHash|tokenHash|tokenVersion/,
    );
  });
  it('revokes an idle provider and excludes them from new assignment choices', async () => {
    await call(
      admin,
      'post',
      '/admin/operations/providers/' + otherProviderId + '/revoke',
    )
      .send({ reason })
      .expect(201);
    expect(
      (
        await prisma.provider.findUniqueOrThrow({
          where: { id: otherProviderId },
        })
      ).approved,
    ).toBe(false);
    expect(
      await prisma.adminOperation.count({
        where: { resourceId: otherProviderId, action: 'PROVIDER_REVOKED' },
      }),
    ).toBe(1);
    await call(
      admin,
      'post',
      '/admin/operations/providers/' + otherProviderId + '/revoke',
    )
      .send({ reason })
      .expect(409);
  });
  it('customer request → reviewed provider assignment → accepted quote → completed booking without payment', async () => {
    const id = await order();
    await call(admin, 'post', '/admin/operations/bookings/' + id + '/assign')
      .send({ providerId, reason })
      .expect(201);
    await call(customer, 'post', '/orders/' + id + '/start')
      .send({})
      .expect(403);
    await call(provider, 'post', '/orders/' + id + '/start')
      .send({})
      .expect(409);
    const quote = await call(provider, 'post', '/orders/' + id + '/quote')
      .send({ amount: '2500.00' })
      .expect(201);
    await call(otherProvider, 'post', '/orders/' + id + '/quote/accept')
      .send({ quoteId: (quote.body as { id: string }).id })
      .expect(404);
    await call(customer, 'post', '/orders/' + id + '/quote/accept')
      .send({ quoteId: (quote.body as { id: string }).id })
      .expect(201);
    await call(provider, 'post', '/orders/' + id + '/start')
      .send({})
      .expect(201);
    await call(provider, 'post', '/orders/' + id + '/complete')
      .send({})
      .expect(201);
    const visible = await call(customer, 'get', '/orders/' + id).expect(200);
    expect((visible.body as { status: string }).status).toBe('COMPLETED');
    expect(await prisma.payment.count({ where: { orderId: id } })).toBe(0);
    await call(provider, 'post', '/orders/' + id + '/complete')
      .send({})
      .expect(409);
  });
  it('role revocation takes effect for an already-issued JWT', async () => {
    await prisma.userRole.deleteMany({ where: { userId: admin.id } });
    await call(admin, 'get', '/admin/operations/bookings').expect(403);
    const id = await order();
    await call(admin, 'post', '/admin/operations/bookings/' + id + '/cancel')
      .send({ reason })
      .expect(403);
  });
});
