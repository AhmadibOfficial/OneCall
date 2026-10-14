import { SERVICE_NAMES } from '../../modules/services/nigeria';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AppModule } from '@/bootstrap/app.module';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';

describe('ONE-BOLA — Order object authorization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const ids: {
    users: string[];
    providers: string[];
    orders: string[];
  } = {
    users: [],
    providers: [],
    orders: [],
  };

  function uniqueSuffix(): string {
    return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  }

  async function createUser(label: string) {
    const suffix = uniqueSuffix();

    const user = await prisma.user.create({
      data: {
        uid: `BOLA${suffix.slice(-6)}`,
        email: `${label}-${suffix}@example.invalid`,
        phone: `+2348${suffix.slice(-9)}`,
        passwordHash: 'test-only-hash',
        firstName: 'Bola',
        lastName: label,
        status: 'ACTIVE',
        emailVerified: true,
        phoneVerified: true,
      },
    });

    ids.users.push(user.id);
    return user;
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

    await app.init();

    prisma = moduleRef.get<PrismaService>(PrismaService);

    jwtService = moduleRef.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    if (ids.orders.length > 0) {
      await prisma.order.deleteMany({
        where: {
          id: {
            in: ids.orders,
          },
        },
      });
    }

    if (ids.providers.length > 0) {
      await prisma.provider.deleteMany({
        where: {
          id: {
            in: ids.providers,
          },
        },
      });
    }

    if (ids.users.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: ids.users,
          },
        },
      });
    }

    await app.close();
  });

  it('prevents customer A from reading customer B order', async () => {
    const customerA = await createUser('customer-a');

    const customerB = await createUser('customer-b');

    const order = await prisma.order.create({
      data: {
        customerId: customerB.id,
        serviceName: 'Mechanic',
        description: 'Customer B private order',
      },
    });

    ids.orders.push(order.id);

    const token = await tokenFor(customerA);

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('allows customer to read their own order', async () => {
    const customer = await createUser('owner');

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        serviceName: 'Tailoring',
        description: 'Owner order',
      },
    });

    ids.orders.push(order.id);

    const token = await tokenFor(customer);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(order.id);
    expect(response.body.serviceName).toBe('Tailoring');
  });

  it('prevents provider A from reading provider B order', async () => {
    const customer = await createUser('provider-customer');

    const providerUserA = await createUser('provider-a');

    const providerUserB = await createUser('provider-b');

    const providerA = await prisma.provider.create({
      data: {
        userId: providerUserA.id,
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

    const providerB = await prisma.provider.create({
      data: {
        userId: providerUserB.id,
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

    ids.providers.push(providerA.id, providerB.id);

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        providerId: providerB.id,
        serviceName: 'Solar Installation',
        description: 'Provider B order',
      },
    });

    ids.orders.push(order.id);

    const token = await tokenFor(providerUserA);

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('allows assigned provider to read the order', async () => {
    const customer = await createUser('assigned-customer');

    const providerUser = await createUser('assigned-provider');

    const provider = await prisma.provider.create({
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

    ids.providers.push(provider.id);

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        providerId: provider.id,
        serviceName: 'Carpentry',
      },
    });

    ids.orders.push(order.id);

    const token = await tokenFor(providerUser);

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('rejects unauthenticated access to an order', async () => {
    const customer = await createUser('unauth-customer');

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        serviceName: 'Painting',
      },
    });

    ids.orders.push(order.id);

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .expect(401);
  });
});
