import { INestApplication } from '@nestjs/common';

import { Test, TestingModule } from '@nestjs/testing';

import express from 'express';
import request from 'supertest';

import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import { AppModule } from '../../bootstrap/app.module';
import { PaymentWebhookSignatureService } from '../../modules/payment/webhook/payment-webhook-signature.service';
const TEST_SECRET = 'onecall-webhook-test-secret-2026-abcdef123456';

function getWebhookSecret(): string {
  return TEST_SECRET;
}

function sign(body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = createHmac('sha256', getWebhookSecret())
    .update(`${timestamp}.${body}`)
    .digest('hex');

  return `t=${timestamp},v1=${digest}`;
}

describe('ONE-PAYMENT — webhook security', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const users: string[] = [];
  const orders: string[] = [];
  const payments: string[] = [];

  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = TEST_SECRET;
    process.env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS = '300';
    process.env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS = '300';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PaymentWebhookSignatureService)
      .useValue(new PaymentWebhookSignatureService(TEST_SECRET, 300))
      .compile();

    app = moduleRef.createNestApplication({
      bodyParser: false,
    });

    app.setGlobalPrefix('api/v1');

    app.use(
      express.json({
        limit: '128kb',
        strict: true,
        verify: (req, _res, buf) => {
          (
            req as express.Request & {
              rawBody?: Buffer;
            }
          ).rawBody = Buffer.from(buf);
        },
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (payments.length) {
      await prisma.paymentWebhookEvent.deleteMany({
        where: {
          paymentId: {
            in: payments,
          },
        },
      });

      await prisma.payment.deleteMany({
        where: {
          id: {
            in: payments,
          },
        },
      });
    }

    if (orders.length) {
      await prisma.order.deleteMany({
        where: {
          id: {
            in: orders,
          },
        },
      });
    }

    if (users.length) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: users,
          },
        },
      });
    }

    await app.close();
  });

  async function createPayment(amount = '1500.00', currency = 'NGN') {
    const suffix = randomBytes(6).toString('hex');

    const user = await prisma.user.create({
      data: {
        uid: `W${suffix.slice(0, 9)}`,
        email: `webhook-${suffix}@example.test`,
        phone: `08${suffix.slice(0, 9)}`,
        passwordHash: 'test-password-hash',
        firstName: 'Webhook',
        lastName: 'Test',
      },
    });

    users.push(user.id);

    const order = await prisma.order.create({
      data: {
        customerId: user.id,
        serviceName: 'Webhook Test Service',
        amount: new Prisma.Decimal(amount),
      },
    });

    orders.push(order.id);

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: new Prisma.Decimal(amount),
        currency,
        idempotencyKey: `webhook-${suffix}`,
      },
    });

    payments.push(payment.id);

    return payment;
  }

  function bodyFor(paymentId: string, overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      eventId: overrides.eventId ?? `evt_${randomUUID()}`,

      type: overrides.type ?? 'payment.succeeded',

      data: {
        paymentId,

        providerReference: overrides.providerReference ?? `ref_${randomUUID()}`,

        amount: overrides.amount ?? '1500.00',

        currency: overrides.currency ?? 'NGN',
      },
    });
  }

  async function postWebhook(
    body: string,
    signatureBody = body,
    eventId?: string,
    timestamp = Math.floor(Date.now() / 1000),
  ) {
    const req = request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('content-type', 'application/json')
      .set('x-onecall-signature', sign(signatureBody, timestamp));

    if (eventId) {
      req.set('x-onecall-event-id', eventId);
    }

    return req.send(body);
  }

  it('rejects missing signatures', async () => {
    const payment = await createPayment();

    const body = bodyFor(payment.id);

    const response = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('content-type', 'application/json')
      .send(body);

    expect(response.status).toBe(401);
  });

  it('rejects stale webhook timestamps', async () => {
    const payment = await createPayment();

    const body = bodyFor(payment.id);

    const stale = Math.floor(Date.now() / 1000) - 301;

    const response = await postWebhook(body, body, undefined, stale);

    expect(response.status).toBe(401);
  });

  it('rejects unknown payments', async () => {
    const body = bodyFor(randomUUID());

    const response = await postWebhook(body);

    expect(response.status).toBe(400);
  });

  it('rejects amount mismatches', async () => {
    const payment = await createPayment('1500.00');

    const body = bodyFor(payment.id, {
      amount: '1500.01',
    });

    const response = await postWebhook(body);

    expect(response.status).toBe(409);
  });

  it('rejects currency mismatches', async () => {
    const payment = await createPayment();

    const body = bodyFor(payment.id, {
      currency: 'USD',
    });

    const response = await postWebhook(body);

    expect(response.status).toBe(409);
  });

  it('accepts a valid signed success event', async () => {
    const payment = await createPayment();

    const body = bodyFor(payment.id);

    const parsed = JSON.parse(body);

    const response = await postWebhook(body, body, parsed.eventId);

    expect(response.status).toBe(200);

    expect(response.body.received).toBe(true);

    expect(response.body.duplicate).toBe(false);

    const updated = await prisma.payment.findUnique({
      where: {
        id: payment.id,
      },
    });

    expect(updated?.status).toBe('SUCCEEDED');

    expect(updated?.providerReference).toBe(parsed.data.providerReference);

    expect(updated?.paidAt).toBeInstanceOf(Date);
  });

  it('treats the exact same event as idempotent', async () => {
    const payment = await createPayment();

    const body = bodyFor(payment.id);

    const parsed = JSON.parse(body);

    const signature = sign(body);

    const first = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('content-type', 'application/json')
      .set('x-onecall-event-id', parsed.eventId)
      .set('x-onecall-signature', signature)
      .send(body);

    const second = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('content-type', 'application/json')
      .set('x-onecall-event-id', parsed.eventId)
      .set('x-onecall-signature', signature)
      .send(body);

    expect(first.status).toBe(200);

    expect(second.status).toBe(200);

    expect(second.body.duplicate).toBe(true);

    const eventCount = await prisma.paymentWebhookEvent.count({
      where: {
        eventId: parsed.eventId,
      },
    });

    expect(eventCount).toBe(1);
  });

  it('rejects event-id reuse with different payload bytes', async () => {
    const payment = await createPayment();

    const eventId = `evt_${randomUUID()}`;

    const firstBody = bodyFor(payment.id, {
      eventId,
    });

    const secondBody = bodyFor(payment.id, {
      eventId,
      providerReference: `ref_different_${randomUUID()}`,
    });

    const first = await postWebhook(firstBody, firstBody, eventId);

    const second = await postWebhook(secondBody, secondBody, eventId);

    expect(first.status).toBe(200);

    expect(second.status).toBe(409);
  });

  it('rejects provider-reference rebinding', async () => {
    const payment = await createPayment();

    const originalReference = `ref_original_${randomUUID()}`;

    await prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        providerReference: originalReference,
      },
    });

    const body = bodyFor(payment.id, {
      providerReference: `ref_attacker_${randomUUID()}`,
    });

    const response = await postWebhook(body);

    expect(response.status).toBe(409);

    const unchanged = await prisma.payment.findUnique({
      where: {
        id: payment.id,
      },
    });

    expect(unchanged?.providerReference).toBe(originalReference);

    expect(unchanged?.status).toBe('INITIATED');
  });

  it('rejects illegal refund transitions', async () => {
    const payment = await createPayment();

    const body = bodyFor(payment.id, {
      type: 'payment.refunded',
    });

    const response = await postWebhook(body);

    expect(response.status).toBe(409);

    const eventCount = await prisma.paymentWebhookEvent.count({
      where: {
        paymentId: payment.id,
      },
    });

    expect(eventCount).toBe(0);
  });

  it('processes concurrent delivery of the same event only once', async () => {
    const payment = await createPayment();

    const body = bodyFor(payment.id);

    const parsed = JSON.parse(body);

    const signature = sign(body);

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/payments/webhook')
        .set('content-type', 'application/json')
        .set('x-onecall-event-id', parsed.eventId)
        .set('x-onecall-signature', signature)
        .send(body),

      request(app.getHttpServer())
        .post('/api/v1/payments/webhook')
        .set('content-type', 'application/json')
        .set('x-onecall-event-id', parsed.eventId)
        .set('x-onecall-signature', signature)
        .send(body),
    ]);

    expect(first.status).toBe(200);

    expect(second.status).toBe(200);

    const eventCount = await prisma.paymentWebhookEvent.count({
      where: {
        eventId: parsed.eventId,
      },
    });

    expect(eventCount).toBe(1);

    const updated = await prisma.payment.findUnique({
      where: {
        id: payment.id,
      },
    });

    expect(updated?.status).toBe('SUCCEEDED');
  });
});
