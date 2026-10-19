import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { configureApplication } from '@/bootstrap/configure-application';

@Controller('ip')
class IpFixtureController {
  @Get() ip(@Req() req: Request) {
    return { ip: req.ip, ips: req.ips };
  }
}
describe('Configured proxy trust', () => {
  let app: INestApplication;
  afterEach(async () => {
    if (app) await app.close();
  });
  async function start(trustProxy: number) {
    const moduleRef = await Test.createTestingModule({
      controllers: [IpFixtureController],
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService({
            API_PREFIX: 'api/v1',
            TRUST_PROXY: trustProxy,
          }),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApplication(app);
    await app.init();
  }
  test('default trust rejects spoofed forwarded IPs', async () => {
    await start(0);
    const response = await request(app.getHttpServer())
      .get('/api/v1/ip')
      .set('X-Forwarded-For', '203.0.113.99')
      .expect(200);
    expect(response.body.ip).not.toBe('203.0.113.99');
    expect(response.body.ips).toEqual([]);
  });
  test('an explicitly configured single proxy resolves the forwarded client IP', async () => {
    await start(1);
    const response = await request(app.getHttpServer())
      .get('/api/v1/ip')
      .set('X-Forwarded-For', '203.0.113.99')
      .expect(200);
    expect(response.body.ip).toBe('203.0.113.99');
    expect(response.body.ips[0]).toBe('203.0.113.99');
  });
});
