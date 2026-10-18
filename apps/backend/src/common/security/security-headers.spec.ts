import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '@/bootstrap/configure-application';

@Controller('health')
class FixtureController {
  @Get() health() {
    return { ok: true };
  }
}

describe('HTTP security headers', () => {
  let app: INestApplication;
  const originalEnvironment = process.env.NODE_ENV;
  afterEach(async () => {
    process.env.NODE_ENV = originalEnvironment;
    if (app) await app.close();
  });
  test.each(['development', 'production'])(
    '%s sends security headers with environment-appropriate HSTS',
    async (environment) => {
      process.env.NODE_ENV = environment;
      const moduleRef = await Test.createTestingModule({
        controllers: [FixtureController],
        providers: [
          {
            provide: ConfigService,
            useValue: new ConfigService({
              API_PREFIX: 'api/v1',
              TRUST_PROXY: 0,
            }),
          },
        ],
      }).compile();
      app = moduleRef.createNestApplication({ bodyParser: false });
      configureApplication(app);
      await app.init();
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['content-security-policy']).toBeTruthy();
      expect(response.headers['strict-transport-security']).toBe(
        environment === 'production'
          ? 'max-age=31536000; includeSubDomains'
          : undefined,
      );
    },
  );
});
