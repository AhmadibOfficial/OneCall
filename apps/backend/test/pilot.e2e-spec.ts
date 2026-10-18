import { SERVICE_NAMES } from '../src/modules/services/nigeria';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/bootstrap/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';
import { PrismaService } from '../src/infrastructure/database/prisma';
import { AuthService } from '../src/modules/auth/auth.service';

function payload<T>(response: { body: unknown }): T {
  return response.body as T;
}

describe('Kaduna pilot: real HTTP and database contracts', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let auth: AuthService;
  const userIds: string[] = [];
  const password = 'PilotTest2026!';
  const stamp = randomBytes(5).toString('hex');
  let sequence = 0;
  let customer: Awaited<ReturnType<typeof account>>;
  let providerUser: Awaited<ReturnType<typeof account>>;
  let outsider: Awaited<ReturnType<typeof account>>;

  async function account(active = true) {
    const n = ++sequence;
    const user = await prisma.user.create({
      data: {
        uid: String(
          (BigInt('0x' + randomBytes(5).toString('hex')) % 9000000000n) +
            1000000000n,
        ),
        email: `pilot-${stamp}-${n}@example.com`,
        phone:
          '+2348' + String(Date.now()).slice(-7) + String(n).padStart(2, '0'),
        firstName: 'Pilot',
        lastName: 'Test',
        passwordHash: await argon2.hash(password),
        status: active ? 'ACTIVE' : 'PENDING',
        emailVerified: active,
        phoneVerified: active,
      },
    });
    userIds.push(user.id);
    const session = await auth.login({ email: user.email, password });
    return { ...user, ...session };
  }

  beforeAll(async () => {
    if (process.env.ONECALL_ALLOW_TEST_DATABASE !== 'true')
      throw new Error(
        'Set ONECALL_ALLOW_TEST_DATABASE=true only for a disposable test database.',
      );
    app = await NestFactory.create(AppModule, {
      bodyParser: false,
      logger: false,
    });
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    customer = await account();
    providerUser = await account();
    outsider = await account();
    await prisma.provider.create({
      data: {
        userId: providerUser.id,
        approved: true,
        coverage: {
          create: SERVICE_NAMES.map((serviceName) => ({
            state: 'Kaduna',
            cityKey: 'kaduna',
            serviceName,
          })),
        },
      },
    });
  });
  afterAll(async () => {
    if (prisma && userIds.length) {
      const orders = await prisma.order.findMany({
        where: { customerId: { in: userIds } },
        select: { id: true },
      });
      await prisma.paymentWebhookEvent.deleteMany({
        where: { payment: { orderId: { in: orders.map((o) => o.id) } } },
      });
      await prisma.payment.deleteMany({
        where: { orderId: { in: orders.map((o) => o.id) } },
      });
      await prisma.order.deleteMany({ where: { customerId: { in: userIds } } });
      await prisma.provider.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  test('startup health, headers and Kaduna catalogue', async () => {
    const health = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(health.headers['x-powered-by']).toBeUndefined();
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    const catalogue = await request(app.getHttpServer())
      .get('/api/v1/services')
      .expect(200);
    expect(payload<{ city: string }>(catalogue).city).toBe('Kaduna');
    expect(payload<{ services: unknown[] }>(catalogue).services).toHaveLength(
      SERVICE_NAMES.length,
    );
  });

  test('registration → login → verification → service request', async () => {
    const email = `registration-${stamp}@example.com`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        phone: '+2348' + String(Date.now()).slice(-9),
        password,
        firstName: 'Ahmad',
        lastName: 'Pilot',
      })
      .expect(201);
    userIds.push(payload<{ id: string }>(registration).id);
    expect(
      payload<{ passwordHash?: string }>(registration).passwordHash,
    ).toBeUndefined();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    const bearer =
      'Bearer ' + payload<{ accessToken: string }>(login).accessToken;
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', bearer)
      .send({ serviceName: 'Tailoring' })
      .expect(403);
    const originalEnvironment = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      const e = await request(app.getHttpServer())
        .post('/api/v1/auth/email-verification/request')
        .set('Authorization', bearer)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/auth/email-verification/confirm')
        .send({
          verificationToken: payload<{ developmentVerificationToken: string }>(
            e,
          ).developmentVerificationToken,
        })
        .expect(201);
      const p = await request(app.getHttpServer())
        .post('/api/v1/auth/phone-verification/request')
        .set('Authorization', bearer)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/auth/phone-verification/confirm')
        .send({
          selector: payload<{ selector: string }>(p).selector,
          verificationCode: payload<{ developmentVerificationCode: string }>(p)
            .developmentVerificationCode,
        })
        .expect(201);
    } finally {
      process.env.NODE_ENV = originalEnvironment;
    }
    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', bearer)
      .expect(200);
    expect(payload<{ user: { status: string } }>(me).user.status).toBe(
      'ACTIVE',
    );
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', bearer)
      .send({
        serviceName: 'Tailoring',
        address: 'Unguwan Rimi, Kaduna',
        description: 'Kaftan alteration',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      city: 'Kaduna',
      address: 'Unguwan Rimi, Kaduna',
      status: 'PENDING',
      amount: null,
    });
  });

  test('production verification delivers privately and reports missing configuration', async () => {
    const actor = await account(false);
    const original = {
      NODE_ENV: process.env.NODE_ENV,
      AUTH_DELIVERY_URL: process.env.AUTH_DELIVERY_URL,
      AUTH_DELIVERY_SECRET: process.env.AUTH_DELIVERY_SECRET,
    };
    const delivery = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    try {
      process.env.NODE_ENV = 'production';
      process.env.AUTH_DELIVERY_URL = 'https://delivery.example.com/challenges';
      process.env.AUTH_DELIVERY_SECRET = 'onecall-disposable-delivery-secret';
      const result = await request(app.getHttpServer())
        .post('/api/v1/auth/phone-verification/request')
        .set('Authorization', 'Bearer ' + actor.accessToken)
        .send({})
        .expect(201);
      expect(
        Object.keys(payload<Record<string, unknown>>(result)).sort(),
      ).toEqual(['accepted', 'selector']);
      expect(delivery).toHaveBeenCalledTimes(1);
      delete process.env.AUTH_DELIVERY_URL;
      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: actor.email })
        .expect(503);
      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'unknown@example.com' })
        .expect(503);
    } finally {
      delivery.mockRestore();
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('ownership and provider status transitions are visible to the customer', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer ' + customer.accessToken)
      .send({
        serviceName: 'Mechanic',
        address: 'Kaduna test address',
        description: 'Inspect vehicle',
      })
      .expect(201);
    const id = payload<{ id: string }>(created).id;
    await request(app.getHttpServer())
      .get('/api/v1/orders/' + id)
      .set('Authorization', 'Bearer ' + outsider.accessToken)
      .expect(404);
    for (const [action, status] of [
      ['accept', 'ACCEPTED'],
      ['start', 'IN_PROGRESS'],
      ['complete', 'COMPLETED'],
    ]) {
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${id}/${action}`)
        .set('Authorization', 'Bearer ' + providerUser.accessToken)
        .send({})
        .expect(201);
      if (action === 'accept') {
        const quote = await request(app.getHttpServer())
          .post('/api/v1/orders/' + id + '/quote')
          .set('Authorization', 'Bearer ' + providerUser.accessToken)
          .send({ amount: '5000.00' })
          .expect(201);
        await request(app.getHttpServer())
          .post('/api/v1/orders/' + id + '/quote/accept')
          .set('Authorization', 'Bearer ' + customer.accessToken)
          .send({ quoteId: payload<{ id: string }>(quote).id })
          .expect(201);
      }
      const state = await request(app.getHttpServer())
        .get('/api/v1/orders/' + id)
        .set('Authorization', 'Bearer ' + customer.accessToken)
        .expect(200);
      expect(payload<{ status: string }>(state).status).toBe(status);
    }
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${id}/cancel`)
      .set('Authorization', 'Bearer ' + customer.accessToken)
      .send({})
      .expect(409);
  });

  test('request boundaries reject client prices, city overrides and invalid input', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer ' + customer.accessToken)
      .send({
        serviceName: 'Painting',
        amount: '1',
        city: 'Abuja',
        providerId: randomUUID(),
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'bad', password: 123, firstName: '', lastName: '' })
      .expect(400);
  });

  test('exactly one concurrent refresh rotation succeeds', async () => {
    const actor = await account();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => auth.refresh(actor.refreshToken)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.session.count({
        where: { userId: actor.id, revokedAt: null },
      }),
    ).toBe(1);
  });

  test('phone challenge budget is enforced under concurrent guesses', async () => {
    const actor = await account(false);
    const selector = randomBytes(16).toString('hex');
    const token = await prisma.verificationToken.create({
      data: {
        userId: actor.id,
        selector,
        tokenHash: await argon2.hash('654321'),
        type: 'PHONE_VERIFICATION',
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        auth.confirmPhoneVerification({ selector, verificationCode: '123456' }),
      ),
    );
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    const stored = await prisma.verificationToken.findUniqueOrThrow({
      where: { id: token.id },
    });
    expect(stored.attemptCount).toBe(5);
    expect(stored.consumedAt).not.toBeNull();
    await expect(
      auth.confirmPhoneVerification({ selector, verificationCode: '654321' }),
    ).rejects.toThrow();
  });

  test('one password-reset winner revokes old access and refresh tokens', async () => {
    const actor = await account();
    const selector = randomBytes(16).toString('hex');
    const secret = randomBytes(64).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: actor.id,
        selector,
        tokenHash: await argon2.hash(secret),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const outcomes = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        auth.confirmPasswordReset({
          resetToken: `${selector}.${secret}`,
          newPassword: 'ChangedPilot2026!',
        }),
      ),
    );
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer ' + actor.accessToken)
      .expect(401);
    await expect(auth.refresh(actor.refreshToken)).rejects.toThrow();
  });

  test('logout invalidates access and refresh credentials', async () => {
    const actor = await account();
    await auth.logout(actor.id);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer ' + actor.accessToken)
      .expect(401);
    await expect(auth.refresh(actor.refreshToken)).rejects.toThrow();
  });

  test.each(['DEACTIVATED', 'SUSPENDED'] as const)(
    '%s accounts cannot login, refresh or use JWTs',
    async (status) => {
      const actor = await account();
      await prisma.user.update({ where: { id: actor.id }, data: { status } });
      await expect(
        auth.login({ email: actor.email, password }),
      ).rejects.toThrow();
      await expect(auth.refresh(actor.refreshToken)).rejects.toThrow();
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer ' + actor.accessToken)
        .expect(401);
    },
  );

  test('rate limiting is active on the real login route', async () => {
    const replies = [];
    // The onboarding login above already used one of the IP's five attempts.
    for (let n = 0; n < 6; n++)
      replies.push(
        (
          await request(app.getHttpServer())
            .post('/api/v1/auth/login')
            .set('X-Forwarded-For', `203.0.113.${n + 1}`)
            .send({ email: `missing-${n}@example.com`, password })
        ).status,
      );
    expect(replies).toContain(429);
  });
});
