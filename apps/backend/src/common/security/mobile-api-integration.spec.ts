import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/bootstrap/app.module';

describe('ONE-MOBILE-API — security contract', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns JSON from the health endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body).toBeDefined();
  });

  it('rejects unauthenticated access to /users/me', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .expect(401);
  });

  it('rejects unsupported HTTP methods instead of silently accepting them', async () => {
    const response = await request(app.getHttpServer())
      .delete('/api/v1/users/me');

    expect([404, 405]).toContain(response.status);
  });

  it('rejects malformed JSON requests', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect([400, 422]).toContain(response.status);
  });

  it('rejects oversized auth payload fields at validation boundary', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'a'.repeat(255) + '@example.com',
        password: 'Password123',
      });

    expect(response.status).toBe(400);
  });
});
