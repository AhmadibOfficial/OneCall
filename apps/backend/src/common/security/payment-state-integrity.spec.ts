import {
  ConflictException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AppModule } from '@/bootstrap/app.module';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
import { PaymentService } from '@/modules/payment/services/payment.service';

describe('ONE-PAYMENT — state integrity', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let paymentService: PaymentService;

  const cleanup = {
    payments: [] as string[],
    orders: [] as string[],
    users: [] as string[],
  };

  function suffix() {
    return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  }

  async function createUser(label: string) {
    const value = suffix();

    const user = await prisma.user.create({
      data: {
        uid: `P${value.slice(-9)}`,
        email: `${label}-${value}@example.invalid`,
        phone: `+2348${value.slice(-9)}`,
        passwordHash: 'test-only-hash',
        firstName: 'Payment',
        lastName: label,
        status: 'ACTIVE',
        emailVerified: true,
        phoneVerified: true,
      },
    });

    cleanup.users.push(user.id);

    return user;
  }

  async function createOrder(customerId: string, amount = '2500.00') {
    const order = await prisma.order.create({
      data: {
        customerId,
        serviceName: 'Payment Test',
        amount,
        status: 'PENDING',
      },
    });

    cleanup.orders.push(order.id);

    return order;
  }

  async function tokenFor(user: { id: string; uid: string; email: string }) {
    return jwtService.sign({
      sub: user.id,
      tokenVersion: 0,
      uid: user.uid,
      email: user.email,
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    app.setGlobalPrefix('api/v1');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: false,
        },
        validationError: {
          target: false,
          value: false,
        },
      }),
    );

    await app.init();

    prisma = moduleRef.get<PrismaService>(PrismaService);

    jwtService = moduleRef.get<JwtService>(JwtService);

    paymentService = moduleRef.get<PaymentService>(PaymentService);
  });

  afterAll(async () => {
    if (cleanup.payments.length || cleanup.orders.length) {
      const paymentFilters = [];

      if (cleanup.payments.length) {
        paymentFilters.push({
          id: {
            in: cleanup.payments,
          },
        });
      }

      if (cleanup.orders.length) {
        paymentFilters.push({
          orderId: {
            in: cleanup.orders,
          },
        });
      }

      await prisma.payment.deleteMany({
        where: {
          OR: paymentFilters,
        },
      });
    }

    if (cleanup.orders.length) {
      await prisma.order.deleteMany({
        where: {
          id: {
            in: cleanup.orders,
          },
        },
      });
    }

    if (cleanup.users.length) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: cleanup.users,
          },
        },
      });
    }

    await app.close();
  });

  it('uses Order.amount rather than a client-supplied amount', async () => {
    const customer = await createUser('amount-owner');

    const order = await createOrder(customer.id, '3750.00');

    const token = await tokenFor(customer);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey: `amount-${suffix()}`,
        amount: '1.00',
        status: 'SUCCEEDED',
      });

    expect(response.status).toBe(400);
  });

  it('creates payment from the authoritative order amount', async () => {
    const customer = await createUser('authoritative-amount');

    const order = await createOrder(customer.id, '4200.00');

    const token = await tokenFor(customer);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey: `init-${suffix()}`,
      })
      .expect(201);

    expect(response.body.amount).toBe('4200');

    expect(response.body.currency).toBe('NGN');

    expect(response.body.status).toBe('INITIATED');

    cleanup.payments.push(response.body.id);

    const payment = await prisma.payment.findUnique({
      where: {
        id: response.body.id,
      },
    });

    expect(payment?.amount.toString()).toBe('4200');
  });

  it('prevents another customer from initializing payment for the order', async () => {
    const owner = await createUser('payment-owner');

    const attacker = await createUser('payment-attacker');

    const order = await createOrder(owner.id);

    const token = await tokenFor(attacker);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey: `bola-${suffix()}`,
      })
      .expect(404);
  });

  it('returns the same payment for a repeated idempotency key', async () => {
    const customer = await createUser('idempotent-owner');

    const order = await createOrder(customer.id, '5100.00');

    const token = await tokenFor(customer);

    const idempotencyKey = `same-${suffix()}`;

    const first = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey,
      })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey,
      })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);

    cleanup.payments.push(first.body.id);
  });

  it('enforces the legal payment state transitions', async () => {
    const customer = await createUser('state-owner');

    const order = await createOrder(customer.id, '6200.00');

    const payment = await paymentService.initialize(customer.id, order.id, {
      idempotencyKey: `state-${suffix()}`,
    });

    cleanup.payments.push(payment.id);

    expect(payment.status).toBe('INITIATED');

    await paymentService.moveToPending(payment.id);

    const pending = await paymentService.get(payment.id);

    expect(pending.status).toBe('PENDING');

    await paymentService.markSucceeded(payment.id, `provider-${suffix()}`);

    const succeeded = await paymentService.get(payment.id);

    expect(succeeded.status).toBe('SUCCEEDED');

    await expect(paymentService.markFailed(payment.id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    await paymentService.refund(payment.id);

    const refunded = await paymentService.get(payment.id);

    expect(refunded.status).toBe('REFUNDED');

    await expect(
      paymentService.markSucceeded(payment.id, `provider-${suffix()}`),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows only one concurrent success transition', async () => {
    const customer = await createUser('concurrent-success');

    const order = await createOrder(customer.id, '7100.00');

    const payment = await paymentService.initialize(customer.id, order.id, {
      idempotencyKey: `concurrent-${suffix()}`,
    });

    cleanup.payments.push(payment.id);

    const [first, second] = await Promise.allSettled([
      paymentService.markSucceeded(payment.id, `gateway-a-${suffix()}`),
      paymentService.markSucceeded(payment.id, `gateway-b-${suffix()}`),
    ]);

    const fulfilled = [first, second].filter(
      (result) => result.status === 'fulfilled',
    );

    const rejected = [first, second].filter(
      (result) => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const finalPayment = await paymentService.get(payment.id);

    expect(finalPayment.status).toBe('SUCCEEDED');
  });

  it('does not expose payment idempotency secrets in the response', async () => {
    const customer = await createUser('response-owner');

    const order = await createOrder(customer.id);

    const token = await tokenFor(customer);

    const idempotencyKey = `response-${suffix()}`;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey,
      })
      .expect(201);

    cleanup.payments.push(response.body.id);

    expect(
      Object.prototype.hasOwnProperty.call(response.body, 'idempotencyKey'),
    ).toBe(false);

    expect(
      Object.prototype.hasOwnProperty.call(response.body, 'providerReference'),
    ).toBe(false);
  });
});
