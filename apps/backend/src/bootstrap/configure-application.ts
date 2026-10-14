import express from 'express';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express, Request } from 'express';
import { configureHttpSecurity } from './configure-http-security';

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX') ?? 'api/v1';
  const adapter = app.getHttpAdapter().getInstance() as Express;
  adapter.set('trust proxy', Number(config.get('TRUST_PROXY') ?? 0));
  configureHttpSecurity(app);
  app.use(
    '/legal',
    express.static(resolve(__dirname, '../../legal-web'), {
      index: 'index.html',
      dotfiles: 'deny',
      setHeaders: (response) => response.setHeader('Cache-Control', 'no-cache'),
    }),
  );
  app.use(
    '/admin',
    express.static(resolve(__dirname, '../../admin-web'), {
      index: 'index.html',
      setHeaders: (response) => response.setHeader('Cache-Control', 'no-store'),
    }),
  );
  app.use(
    express.json({
      limit: '128kb',
      strict: true,
      verify: (request, _response, buffer) => {
        (request as Request & { rawBody?: Buffer }).rawBody =
          Buffer.from(buffer);
      },
    }),
  );
  app.use(
    `/${prefix}/payments/webhook`,
    express.raw({ type: '*/*', limit: '128kb' }),
  );
  app.use(
    `/${prefix}/auth/social/callback/apple`,
    express.urlencoded({ extended: false, limit: '16kb' }),
  );
  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length)
    app.enableCors({
      origin: origins,
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
}
