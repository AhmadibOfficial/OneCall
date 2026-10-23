import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Server } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/bootstrap/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';
import { PrismaService } from '../src/infrastructure/database/prisma';
import { AuthService } from '../src/modules/auth/auth.service';
import { PaystackGateway } from '../src/modules/marketplace/paystack.gateway';

function body<T>(response: { body: unknown }): T {
  return response.body as T;
}
type Actor = { id: string; email: string; accessToken: string };
type Order = {
  id: string;
  amount: string | null;
  status: string;
  providerAssigned: boolean;
  address: string | null;
};
type Quote = { id: string; amount: string };
type Checkout = { id: string; status: string; amount: string };

describe('Nigeria marketplace: HTTP, database and mocked gateway', () => {
  let app: INestApplication<Server>,
    prisma: PrismaService,
    auth: AuthService,
    gateway: PaystackGateway;
  let customer: Actor,
    other: Actor,
    lagos: Actor,
    kaduna: Actor,
    applicant: Actor;
  const ids: string[] = [];
  const password = 'NigeriaTest2026!';
  const originalOrigins = process.env.CORS_ORIGINS;
  const secret = 'sk_test_onecalldisposable';
  const verified = new Map<
    string,
    { successful: boolean; amountKobo: bigint; email: string }
  >();
  const initialized: string[] = [];
  let sequence = 0;
  const stamp = randomBytes(5).toString('hex');
  async function account(): Promise<Actor> {
    const user = await prisma.user.create({
      data: {
        uid: String(
          (BigInt('0x' + randomBytes(5).toString('hex')) % 9000000000n) +
            1000000000n,
        ),
        email: `ng-${stamp}-${++sequence}@example.com`,
        phone:
          '+2348' +
          String(Date.now()).slice(-7) +
          String(sequence).padStart(2, '0'),
        firstName: 'Nigeria',
        lastName: 'Test',
        passwordHash: await argon2.hash(password),
        status: 'ACTIVE',
        emailVerified: true,
        phoneVerified: true,
      },
    });
    ids.push(user.id);
    const session = await auth.login({ email: user.email, password });
    return { id: user.id, email: user.email, accessToken: session.accessToken };
  }
  function call(
    actor: Actor,
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    path: string,
  ) {
    return request(app.getHttpServer())
      [method]('/api/v1' + path)
      .set('Authorization', 'Bearer ' + actor.accessToken);
  }
  async function create(state = 'Lagos', city = 'Ikeja'): Promise<Order> {
    return body<Order>(
      await call(customer, 'post', '/orders')
        .send({
          serviceName: 'Plumbing',
          state,
          city,
          address: 'Private street and landmark',
          description: 'Repair a leaking pipe',
        })
        .expect(201),
    );
  }
  async function priced(): Promise<Order> {
    const order = await create();
    await call(lagos, 'post', '/orders/' + order.id + '/accept')
      .send({})
      .expect(201);
    const quote = body<Quote>(
      await call(lagos, 'post', '/orders/' + order.id + '/quote')
        .send({ amount: '5000.00' })
        .expect(201),
    );
    await call(customer, 'post', '/orders/' + order.id + '/quote/accept')
      .send({ quoteId: quote.id })
      .expect(201);
    return order;
  }
  beforeAll(async () => {
    if (process.env.ONECALL_ALLOW_TEST_DATABASE !== 'true')
      throw new Error('Use a disposable test database');
    process.env.CORS_ORIGINS = 'https://client.example.com';
    app = await NestFactory.create(AppModule, {
      bodyParser: false,
      logger: false,
    });
    app.get(ConfigService).set('CORS_ORIGINS', 'https://client.example.com');
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    gateway = app.get(PaystackGateway);
    app.get(ConfigService).set('PAYSTACK_SECRET_KEY', secret);
    app.get(ConfigService).set('ONECALL_PAYMENT_MODE', 'test');
    app.get(ConfigService).set('ONECALL_WALLET_ENABLED', 'true');
    jest
      .spyOn(gateway, 'initialize')
      .mockImplementation((reference, amountKobo, email) => {
        initialized.push(reference);
        verified.set(reference, { successful: false, amountKobo, email });
        return Promise.resolve(
          'https://checkout.paystack.com/test-' + initialized.length,
        );
      });
    jest
      .spyOn(gateway, 'verify')
      .mockImplementation((reference) =>
        Promise.resolve(verified.get(reference)!),
      );
    customer = await account();
    other = await account();
    lagos = await account();
    kaduna = await account();
    applicant = await account();
    for (const [actor, state, city] of [
      [lagos, 'Lagos', 'ikeja'],
      [kaduna, 'Kaduna', 'kaduna'],
    ] as const)
      await prisma.provider.create({
        data: {
          userId: actor.id,
          approved: true,
          coverage: {
            create: { state, cityKey: city, serviceName: 'Plumbing' },
          },
        },
      });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    if (originalOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = originalOrigins;
    if (prisma && ids.length) {
      const orders = await prisma.order.findMany({
        where: { customerId: { in: ids } },
        select: { id: true },
      });
      const orderIds = orders.map((o) => o.id);
      await prisma.checkoutIntent.deleteMany({
        where: { userId: { in: ids } },
      });
      await prisma.paymentWebhookEvent.deleteMany({
        where: { payment: { orderId: { in: orderIds } } },
      });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.walletEntry.deleteMany({
        where: { wallet: { userId: { in: ids } } },
      });
      await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.provider.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  });
  test('browser account writes accept only configured origins and methods', async () => {
    const preflight = await request(app.getHttpServer())
      .options('/api/v1/profile')
      .set('Origin', 'https://client.example.com')
      .set('Access-Control-Request-Method', 'PATCH')
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(
      'https://client.example.com',
    );
    expect(preflight.headers['access-control-allow-methods']).toContain(
      'PATCH',
    );
    const denied = await request(app.getHttpServer())
      .options('/api/v1/favorites')
      .set('Origin', 'https://foreign.example.com')
      .set('Access-Control-Request-Method', 'DELETE');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
  test('all states and FCT have a catalogue; provider availability is scoped', async () => {
    const locations = body<{ states: string[] }>(
      await request(app.getHttpServer()).get('/api/v1/locations').expect(200),
    );
    expect(locations.states).toHaveLength(37);
    expect(locations.states).toContain('FCT');
    const catalogue = body<{
      country: string;
      services: { name: string; availableProviders: number }[];
    }>(
      await request(app.getHttpServer())
        .get('/api/v1/services?state=Lagos&city=Ikeja')
        .expect(200),
    );
    expect(catalogue.country).toBe('NG');
    expect(catalogue.services).toHaveLength(20);
    expect(
      catalogue.services.find((s) => s.name === 'Plumbing')?.availableProviders,
    ).toBe(1);
    const uncovered = body<{ services: { availableProviders: number }[] }>(
      await request(app.getHttpServer())
        .get('/api/v1/services?state=Abia&city=Umuahia')
        .expect(200),
    );
    expect(uncovered.services.every((s) => s.availableProviders === 0)).toBe(
      true,
    );
    await request(app.getHttpServer())
      .get('/api/v1/services?state=Invalid&city=City')
      .expect(400);
  });
  test('provider applications cannot approve themselves or claim jobs', async () => {
    await call(applicant, 'post', '/provider/apply')
      .send({
        displayName: 'Applicant',
        state: 'Lagos',
        city: 'Ikeja',
        serviceNames: ['Plumbing'],
        approved: true,
      })
      .expect(400);
    const application = body<{ approved: boolean }>(
      await call(applicant, 'post', '/provider/apply')
        .send({
          displayName: 'Applicant',
          state: 'Lagos',
          city: 'Ikeja',
          serviceNames: ['Plumbing'],
        })
        .expect(201),
    );
    expect(application.approved).toBe(false);
    await call(applicant, 'get', '/orders/available').expect(403);
    const order = await create();
    await call(applicant, 'post', '/orders/' + order.id + '/accept')
      .send({})
      .expect(403);
  });
  test('region, routes and client-controlled prices are validated', async () => {
    for (const input of [
      { serviceName: 'Plumbing', state: 'Lagos' },
      { serviceName: 'Ride Booking', state: 'Lagos', city: 'Ikeja' },
      { serviceName: 'Plumbing', state: 'Lagos', city: 'Ikeja', amount: '1' },
      { serviceName: 'Plumbing', state: 'Lagos', city: '///' },
    ])
      await call(customer, 'post', '/orders').send(input).expect(400);
    const ride = body<Order>(
      await call(customer, 'post', '/orders')
        .send({
          serviceName: 'Ride Booking',
          state: 'FCT',
          city: 'Abuja',
          pickupAddress: 'Garki district',
          destinationAddress: 'Wuse district',
          vehicleType: 'economy',
        })
        .expect(201),
    );
    expect(ride.status).toBe('PENDING');
  });
  test('coverage, ownership and quote acceptance protect a complete booking', async () => {
    const order = await create();
    const path = '/orders/' + order.id;
    const available = body<Order[]>(
      await call(lagos, 'get', '/orders/available').expect(200),
    );
    expect(available.find((o) => o.id === order.id)?.address).toBeNull();
    await call(kaduna, 'post', path + '/accept')
      .send({})
      .expect(404);
    await call(lagos, 'post', path + '/accept')
      .send({})
      .expect(201);
    await call(other, 'get', path).expect(404);
    await call(lagos, 'post', path + '/start')
      .send({})
      .expect(409);
    await call(customer, 'post', path + '/quote')
      .send({ amount: '1.00' })
      .expect(404);
    const stale = body<Quote>(
      await call(lagos, 'post', path + '/quote')
        .send({ amount: '4000.00' })
        .expect(201),
    );
    const quote = body<Quote>(
      await call(lagos, 'post', path + '/quote')
        .send({ amount: '5000.00' })
        .expect(201),
    );
    expect(quote.id).not.toBe(stale.id);
    await call(customer, 'post', path + '/quote/accept')
      .send({ quoteId: stale.id })
      .expect(409);
    await call(other, 'post', path + '/quote/accept')
      .send({ quoteId: quote.id })
      .expect(404);
    await call(customer, 'post', path + '/quote/accept')
      .send({ quoteId: quote.id })
      .expect(201);
    expect(
      body<Order>(await call(customer, 'get', path).expect(200)).amount,
    ).toBe('5000.00');
    await call(lagos, 'post', path + '/quote')
      .send({ amount: '6000.00' })
      .expect(409);
    await call(lagos, 'post', path + '/start')
      .send({})
      .expect(201);
    await call(customer, 'post', path + '/location')
      .send({ latitude: 6.6, longitude: 3.3, accuracy: 5 })
      .expect(404);
    await call(lagos, 'post', path + '/location')
      .send({ latitude: 6.6, longitude: 3.3, accuracy: 5 })
      .expect(201);
    expect(
      body<{ location: { latitude: number } }>(
        await call(customer, 'get', path + '/tracking').expect(200),
      ).location.latitude,
    ).toBe(6.6);
    await call(other, 'get', path + '/tracking').expect(404);
    await call(customer, 'post', path + '/messages')
      .send({ text: 'Please meet at the gate.' })
      .expect(201);
    expect(
      body<{ mine: boolean }[]>(
        await call(lagos, 'get', path + '/messages').expect(200),
      )[0].mine,
    ).toBe(false);
    await call(other, 'get', path + '/messages').expect(404);
    await call(lagos, 'post', path + '/complete')
      .send({})
      .expect(201);
    expect(
      body<{ location: unknown }>(
        await call(customer, 'get', path + '/tracking').expect(200),
      ).location,
    ).toBeNull();
    await call(customer, 'post', path + '/messages')
      .send({ text: 'Late message' })
      .expect(409);
    const notes = body<{ title: string; id: string }[]>(
      await call(customer, 'get', '/notifications').expect(200),
    );
    expect(notes.some((n) => n.title === 'Completed')).toBe(true);
    await call(other, 'post', '/notifications/' + notes[0].id + '/read')
      .send({})
      .expect(404);
  });
  test('saved addresses, favorites and support stay within the account', async () => {
    const input = {
      label: 'Home',
      addressLine1: 'Private Lagos address',
      state: 'Lagos',
      city: 'Ikeja',
      isDefault: true,
    };
    const address = body<{ id: string }>(
      await call(customer, 'post', '/addresses').send(input).expect(201),
    );
    await call(other, 'put', '/addresses/' + address.id)
      .send(input)
      .expect(404);
    await call(other, 'delete', '/addresses/' + address.id).expect(404);
    await call(customer, 'post', '/addresses')
      .send({ ...input, label: 'Office' })
      .expect(201);
    const addresses = body<{ isDefault: boolean }[]>(
      await call(customer, 'get', '/addresses').expect(200),
    );
    expect(addresses.filter((a) => a.isDefault)).toHaveLength(1);
    await call(customer, 'put', '/favorites')
      .send({ serviceName: 'Plumbing' })
      .expect(200);
    expect(
      body<unknown[]>(await call(other, 'get', '/favorites').expect(200)),
    ).toEqual([]);
    await call(customer, 'post', '/support')
      .send({ subject: 'Booking question', message: 'Help with my request' })
      .expect(201);
    expect(
      body<unknown[]>(await call(other, 'get', '/support').expect(200)),
    ).toEqual([]);
  });
  test('payment return page does not confirm a payment or reflect URL parameters', async () => {
    const count = await prisma.payment.count();
    const response = await request(app.getHttpServer())
      .get('/api/v1/payments/paystack/return?reference=private-reference')
      .expect(200);
    expect(response.text).toContain('This page does not confirm a payment');
    expect(response.text).not.toContain('private-reference');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await prisma.payment.count()).toBe(count);
  });
  test('disabled wallet prevents a debit even if a caller bypasses the mobile UI', async () => {
    app.get(ConfigService).set('ONECALL_WALLET_ENABLED', 'false');
    try {
      await call(
        customer,
        'post',
        '/orders/00000000-0000-4000-8000-000000000001/pay-wallet',
      )
        .send({ idempotencyKey: 'disabled.' + stamp })
        .expect(503);
    } finally {
      app.get(ConfigService).set('ONECALL_WALLET_ENABLED', 'true');
    }
  });
  test('a checkout with a missing or different recorded provider domain cannot settle', async () => {
    const order = await priced();
    const checkout = body<Checkout>(
      await call(customer, 'post', '/checkouts')
        .send({ orderId: order.id, idempotencyKey: 'domain.' + stamp })
        .expect(201),
    );
    const before = (gateway.verify as jest.Mock).mock.calls.length;
    for (const providerMode of ['unknown', 'live']) {
      await prisma.checkoutIntent.update({
        where: { id: checkout.id },
        data: { providerMode },
      });
      await call(customer, 'post', '/checkouts/' + checkout.id + '/verify')
        .send({})
        .expect(409);
    }
    expect((gateway.verify as jest.Mock).mock.calls.length).toBe(before);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(
      0,
    );
  });
  test('verified funding is credited once; signatures and mismatched amounts cannot create money', async () => {
    const created = body<Checkout>(
      await call(customer, 'post', '/checkouts')
        .send({ amount: '6000.00', idempotencyKey: 'funding.' + stamp })
        .expect(201),
    );
    const reference = initialized.at(-1)!;
    await call(other, 'post', '/checkouts/' + created.id + '/verify')
      .send({})
      .expect(404);
    const event = JSON.stringify({
      event: 'charge.success',
      data: { reference },
    });
    const signature = createHmac('sha512', secret).update(event).digest('hex');
    await request(app.getHttpServer())
      .post('/api/v1/payments/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', '0'.repeat(128))
      .send(event)
      .expect(401);
    verified.set(reference, {
      successful: true,
      amountKobo: 1n,
      email: customer.email,
    });
    await call(customer, 'post', '/checkouts/' + created.id + '/verify')
      .send({})
      .expect(409);
    expect(
      body<{ balance: string }>(
        await call(customer, 'get', '/wallet').expect(200),
      ).balance,
    ).toBe('0.00');
    verified.set(reference, {
      successful: true,
      amountKobo: 600000n,
      email: customer.email,
    });
    const settled = await Promise.all([
      call(customer, 'post', '/checkouts/' + created.id + '/verify').send({}),
      request(app.getHttpServer())
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', signature)
        .send(event),
    ]);
    expect(settled.map((r) => r.status)).toEqual([201, 201]);
    const wallet = body<{ balance: string; transactions: unknown[] }>(
      await call(customer, 'get', '/wallet').expect(200),
    );
    expect(wallet.balance).toBe('6000.00');
    expect(wallet.transactions).toHaveLength(1);
    const count = initialized.length;
    await call(customer, 'post', '/checkouts')
      .send({ amount: '6000.00', idempotencyKey: 'funding.' + stamp })
      .expect(201);
    expect(initialized.length).toBe(count);
  });
  test('concurrent wallet purchases cannot overspend; retries cannot debit twice', async () => {
    const a = await priced(),
      b = await priced();
    const responses = await Promise.all([
      call(customer, 'post', '/orders/' + a.id + '/pay-wallet').send({
        idempotencyKey: 'wallet.a.' + stamp,
      }),
      call(customer, 'post', '/orders/' + b.id + '/pay-wallet').send({
        idempotencyKey: 'wallet.b.' + stamp,
      }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const index = responses[0].status === 201 ? 0 : 1;
    const paid = [a, b][index];
    await call(customer, 'post', '/orders/' + paid.id + '/pay-wallet')
      .send({
        idempotencyKey: (index === 0 ? 'wallet.a.' : 'wallet.b.') + stamp,
      })
      .expect(201);
    expect(
      body<{ balance: string }>(
        await call(customer, 'get', '/wallet').expect(200),
      ).balance,
    ).toBe('1000.00');
    await call(customer, 'post', '/orders/' + paid.id + '/cancel')
      .send({})
      .expect(409);
    await call(customer, 'post', '/orders/' + paid.id + '/payments')
      .send({ idempotencyKey: 'legacy.' + stamp })
      .expect(409);
  });
  test('a pending legacy payment also prevents cancellation and a second payment channel', async () => {
    const order = await priced();
    await call(customer, 'post', '/orders/' + order.id + '/payments')
      .send({ idempotencyKey: 'legacy.pending.' + stamp })
      .expect(201);
    await call(customer, 'post', '/orders/' + order.id + '/cancel')
      .send({})
      .expect(409);
    await call(customer, 'post', '/checkouts')
      .send({ orderId: order.id, idempotencyKey: 'legacy.block.' + stamp })
      .expect(409);
  });
  test('booking checkout uses the accepted quote and blocks conflicting payment channels', async () => {
    const order = await priced();
    await call(customer, 'post', '/checkouts')
      .send({
        orderId: order.id,
        amount: '1',
        idempotencyKey: 'spoof.' + stamp,
      })
      .expect(400);
    const checkout = body<Checkout>(
      await call(customer, 'post', '/checkouts')
        .send({ orderId: order.id, idempotencyKey: 'order.' + stamp })
        .expect(201),
    );
    const reference = initialized.at(-1)!;
    expect(checkout.amount).toBe('5000.00');
    expect((checkout as Checkout & { paymentMode: string }).paymentMode).toBe(
      'test',
    );
    await call(customer, 'post', '/orders/' + order.id + '/pay-wallet')
      .send({ idempotencyKey: 'collision.' + stamp })
      .expect(409);
    await call(customer, 'post', '/orders/' + order.id + '/payments')
      .send({ idempotencyKey: 'collision2.' + stamp })
      .expect(409);
    verified.set(reference, {
      successful: true,
      amountKobo: 500000n,
      email: customer.email,
    });
    await call(customer, 'post', '/checkouts/' + checkout.id + '/verify')
      .send({})
      .expect(201);
    expect(
      await prisma.payment.count({
        where: { orderId: order.id, status: 'SUCCEEDED' },
      }),
    ).toBe(1);
    expect(
      (await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } }))
        .providerMode,
    ).toBe('test');
  });
});
