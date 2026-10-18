import { SERVICE_NAMES } from '../../modules/services/nigeria';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AppModule } from '@/bootstrap/app.module';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';

describe('ONE-ORDER-BUSINESS — state and mutation invariants', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const cleanup = {
    orders: [] as string[],
    providers: [] as string[],
    users: [] as string[],
  };

  function suffix(): string {
    return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  }

  async function createUser(label: string) {
    const value = suffix();

    const user = await prisma.user.create({
      data: {
        uid: `O${value.slice(-9)}`,
        email: `${label}-${value}@example.invalid`,
        phone: `+2348${value.slice(-9)}`,
        passwordHash: 'test-only-hash',
        firstName: 'Order',
        lastName: label,
        status: 'ACTIVE',
        emailVerified: true,
        phoneVerified: true,
      },
    });

    cleanup.users.push(user.id);

    return user;
  }

  async function createProvider(label: string) {
    const user = await createUser(label);

    const provider = await prisma.provider.create({
      data: {
        userId: user.id,
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

    cleanup.providers.push(provider.id);

    return {
      user,
      provider,
    };
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
  });

  afterAll(async () => {
    if (
      cleanup.orders.length ||
      cleanup.users.length ||
      cleanup.providers.length
    ) {
      const orderFilters = [];

      if (cleanup.orders.length) {
        orderFilters.push({
          id: {
            in: cleanup.orders,
          },
        });
      }

      if (cleanup.users.length) {
        orderFilters.push({
          customerId: {
            in: cleanup.users,
          },
        });
      }

      if (cleanup.providers.length) {
        orderFilters.push({
          providerId: {
            in: cleanup.providers,
          },
        });
      }

      await prisma.order.deleteMany({
        where: {
          OR: orderFilters,
        },
      });
    }

    if (cleanup.providers.length) {
      await prisma.provider.deleteMany({
        where: {
          id: {
            in: cleanup.providers,
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

  it('rejects client-controlled providerId, status, and amount', async () => {
    const customer = await createUser('forged-fields');

    const provider = await createProvider('forged-provider');

    const token = await tokenFor(customer);

    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceName: 'Mechanic',
        description: 'Forged business fields',
        providerId: provider.provider.id,
        status: 'COMPLETED',
        amount: '999999.99',
      });

    expect(response.status).toBe(400);

    const orders = await prisma.order.findMany({
      where: {
        customerId: customer.id,
      },
    });

    expect(orders).toHaveLength(0);
  });

  it('creates orders with server-controlled defaults', async () => {
    const customer = await createUser('server-defaults');

    const token = await tokenFor(customer);

    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceName: 'Tailoring',
        description: 'Valid customer request',
      })
      .expect(201);

    expect(response.body.serviceName).toBe('Tailoring');

    expect(response.body.providerAssigned).toBe(false);

    expect(response.body.status).toBe('PENDING');

    expect(response.body.amount).toBeNull();

    const order = await prisma.order.findUnique({
      where: {
        id: response.body.id,
      },
    });

    expect(order).not.toBeNull();

    if (!order) {
      throw new Error('Order was not created');
    }

    cleanup.orders.push(order.id);

    expect(order.customerId).toBe(customer.id);

    expect(order.providerId).toBeNull();

    expect(order.status).toBe('PENDING');

    expect(order.amount).toBeNull();
  });

  it('allows exactly one provider to claim a pending order', async () => {
    const customer = await createUser('race-customer');

    const providerA = await createProvider('race-provider-a');

    const providerB = await createProvider('race-provider-b');

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        serviceName: 'Solar installation',
        description: 'Concurrent claim test',
      },
    });

    cleanup.orders.push(order.id);

    const tokenA = await tokenFor(providerA.user);

    const tokenB = await tokenFor(providerB.user);

    const [responseA, responseB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/accept`)
        .set('Authorization', `Bearer ${tokenA}`),

      request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/accept`)
        .set('Authorization', `Bearer ${tokenB}`),
    ]);

    const statuses = [responseA.status, responseB.status].sort((a, b) => a - b);

    expect(statuses).toEqual([201, 404]);

    const saved = await prisma.order.findUnique({
      where: {
        id: order.id,
      },
    });

    expect(saved).not.toBeNull();

    if (!saved) {
      throw new Error('Order disappeared');
    }

    expect(saved.status).toBe('ACCEPTED');

    expect([providerA.provider.id, providerB.provider.id]).toContain(
      saved.providerId,
    );
  });

  it('cannot start an order before it is accepted', async () => {
    const customer = await createUser('start-customer');

    const provider = await createProvider('start-provider');

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        serviceName: 'Carpentry',
      },
    });

    cleanup.orders.push(order.id);

    const token = await tokenFor(provider.user);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('cannot complete an order before it is in progress', async () => {
    const customer = await createUser('complete-customer');

    const provider = await createProvider('complete-provider');

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        providerId: provider.provider.id,
        status: 'ACCEPTED',
        serviceName: 'Painting',
      },
    });

    cleanup.orders.push(order.id);

    const token = await tokenFor(provider.user);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('prevents provider A from changing provider B order state', async () => {
    const customer = await createUser('cross-provider-customer');

    const providerA = await createProvider('cross-provider-a');

    const providerB = await createProvider('cross-provider-b');

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        providerId: providerB.provider.id,
        status: 'ACCEPTED',
        serviceName: 'Mechanic',
      },
    });

    cleanup.orders.push(order.id);

    const token = await tokenFor(providerA.user);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const unchanged = await prisma.order.findUnique({
      where: {
        id: order.id,
      },
    });

    expect(unchanged?.status).toBe('ACCEPTED');

    expect(unchanged?.providerId).toBe(providerB.provider.id);
  });

  it('prevents customer cancellation after work has started', async () => {
    const customer = await createUser('cancel-customer');

    const provider = await createProvider('cancel-provider');

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        providerId: provider.provider.id,
        status: 'IN_PROGRESS',
        serviceName: 'Plumbing',
      },
    });

    cleanup.orders.push(order.id);

    const token = await tokenFor(customer);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    const unchanged = await prisma.order.findUnique({
      where: {
        id: order.id,
      },
    });

    expect(unchanged?.status).toBe('IN_PROGRESS');
  });

  it('protects an ACCEPTED order from a concurrent start/cancel race', async () => {
    const customer = await createUser('race-cancel-customer');

    const provider = await createProvider('race-cancel-provider');

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        providerId: provider.provider.id,
        status: 'ACCEPTED',
        serviceName: 'Plumbing',
      },
    });

    cleanup.orders.push(order.id);

    const providerToken = await tokenFor(provider.user);

    const customerToken = await tokenFor(customer);

    const [startResponse, cancelResponse] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/start`)
        .set('Authorization', `Bearer ${providerToken}`),

      request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`),
    ]);

    const statuses = [startResponse.status, cancelResponse.status].sort(
      (a, b) => a - b,
    );

    expect(statuses).toEqual([201, 409]);

    const finalOrder = await prisma.order.findUnique({
      where: {
        id: order.id,
      },
    });

    expect(finalOrder).not.toBeNull();

    if (!finalOrder) {
      throw new Error('Order disappeared');
    }

    if (startResponse.status === 201) {
      expect(cancelResponse.status).toBe(409);
      expect(finalOrder.status).toBe('IN_PROGRESS');
    } else {
      expect(cancelResponse.status).toBe(201);
      expect(finalOrder.status).toBe('CANCELLED');
    }
  });

  it('prevents customer cancellation after completion', async () => {
    const customer = await createUser('completed-customer');

    const provider = await createProvider('completed-provider');

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        providerId: provider.provider.id,
        status: 'COMPLETED',
        serviceName: 'Electrical',
      },
    });

    cleanup.orders.push(order.id);

    const token = await tokenFor(customer);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    const unchanged = await prisma.order.findUnique({
      where: {
        id: order.id,
      },
    });

    expect(unchanged?.status).toBe('COMPLETED');
  });
});
