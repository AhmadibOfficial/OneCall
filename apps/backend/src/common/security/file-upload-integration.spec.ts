import { INestApplication, ValidationPipe } from '@nestjs/common';

import { Test, TestingModule } from '@nestjs/testing';

import { JwtService } from '@nestjs/jwt';

import request from 'supertest';

import { randomBytes, randomUUID } from 'node:crypto';

import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';

import { join } from 'node:path';

import { AppModule } from '../../bootstrap/app.module';

import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';

describe('ONE-UPLOAD — authenticated HTTP security', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const users: string[] = [];
  const uploadIds: string[] = [];
  const storageKeys: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
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

    prisma = app.get(PrismaService);

    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    if (uploadIds.length) {
      await prisma.storedUpload.deleteMany({
        where: {
          id: {
            in: uploadIds,
          },
        },
      });
    }

    for (const storageKey of storageKeys) {
      rmSync(join(process.cwd(), 'storage', 'private', 'avatars', storageKey), {
        force: true,
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

    if (app) {
      await app.close();
    }
  });

  async function createAuthenticatedUser() {
    const suffix = randomBytes(6).toString('hex');

    const user = await prisma.user.create({
      data: {
        uid: `U${suffix.slice(0, 9)}`,
        email: `upload-${suffix}@example.test`,
        phone: `08${suffix.slice(0, 9)}`,
        passwordHash: 'upload-test-password-hash',
        firstName: 'Upload',
        lastName: 'Security',
      },
    });

    users.push(user.id);

    const token = await jwt.signAsync({
      sub: user.id,
      tokenVersion: 0,
      uid: user.uid,
      email: user.email,
    });

    return {
      user,
      token,
    };
  }

  function validJpeg() {
    return Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
    ]);
  }

  function validPng() {
    return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  function maliciousPhp() {
    return Buffer.from('<?php system($_GET["cmd"]); ?>');
  }

  it('requires authentication', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/uploads/avatar')
      .attach('file', validJpeg(), 'avatar.jpg');

    expect(response.status).toBe(401);
  });

  it('accepts an authenticated JPEG upload', async () => {
    const { user, token } = await createAuthenticatedUser();

    const response = await request(app.getHttpServer())
      .post('/api/v1/uploads/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', validJpeg(), 'profile.jpg');

    expect(response.status).toBe(201);

    expect(response.body.id).toEqual(expect.any(String));

    uploadIds.push(response.body.id);

    const stored = await prisma.storedUpload.findUnique({
      where: {
        id: response.body.id,
      },
    });

    expect(stored).not.toBeNull();
    expect(stored?.ownerId).toBe(user.id);

    expect(stored?.purpose).toBe('AVATAR');

    expect(stored?.detectedMime).toBe('image/jpeg');

    expect(stored?.byteSize).toBe(validJpeg().length);

    expect(stored?.sha256).toMatch(/^[0-9a-f]{64}$/);

    expect(stored?.storageKey).toMatch(/^[0-9a-f-]{36}\.jpg$/);

    storageKeys.push(stored!.storageKey);

    const storedPath = join(
      process.cwd(),
      'storage',
      'private',
      'avatars',
      stored!.storageKey,
    );

    expect(existsSync(storedPath)).toBe(true);

    const stats = statSync(storedPath);

    expect(stats.size).toBe(validJpeg().length);

    const savedBytes = readFileSync(storedPath);

    expect(savedBytes.equals(validJpeg())).toBe(true);
  });

  it('ignores the attacker-controlled filename', async () => {
    const { token } = await createAuthenticatedUser();

    const response = await request(app.getHttpServer())
      .post('/api/v1/uploads/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', validPng(), {
        filename: '../../evil.php',
        contentType: 'image/png',
      });

    expect(response.status).toBe(201);

    uploadIds.push(response.body.id);

    const stored = await prisma.storedUpload.findUnique({
      where: {
        id: response.body.id,
      },
    });

    expect(stored).not.toBeNull();

    expect(stored?.storageKey).not.toContain('..');

    expect(stored?.storageKey).not.toContain('/');

    expect(stored?.storageKey).toMatch(/^[0-9a-f-]{36}\.png$/);

    storageKeys.push(stored!.storageKey);
  });

  it('rejects a forged image MIME type', async () => {
    const { token } = await createAuthenticatedUser();

    const response = await request(app.getHttpServer())
      .post('/api/v1/uploads/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', maliciousPhp(), {
        filename: 'avatar.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(400);
  });

  it('rejects unsupported MIME types', async () => {
    const { token } = await createAuthenticatedUser();

    const response = await request(app.getHttpServer())
      .post('/api/v1/uploads/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('plain text'), {
        filename: 'payload.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(400);
  });

  it('rejects requests without a file', async () => {
    const { token } = await createAuthenticatedUser();

    const response = await request(app.getHttpServer())
      .post('/api/v1/uploads/avatar')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  it('allows exactly one uploaded file', async () => {
    const { token } = await createAuthenticatedUser();

    const response = await request(app.getHttpServer())
      .post('/api/v1/uploads/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', validJpeg(), 'one.jpg')
      .attach('file', validPng(), 'two.png');

    expect(response.status).toBe(400);
  });

  it('binds uploaded metadata to the authenticated owner', async () => {
    const first = await createAuthenticatedUser();

    const second = await createAuthenticatedUser();

    const response = await request(app.getHttpServer())
      .post('/api/v1/uploads/avatar')
      .set('Authorization', `Bearer ${first.token}`)
      .attach('file', validPng(), 'avatar.png');

    expect(response.status).toBe(201);

    uploadIds.push(response.body.id);

    const stored = await prisma.storedUpload.findUnique({
      where: {
        id: response.body.id,
      },
    });

    expect(stored?.ownerId).toBe(first.user.id);

    expect(stored?.ownerId).not.toBe(second.user.id);

    storageKeys.push(stored!.storageKey);
  });

  it('uses server-generated storage keys', async () => {
    const { token } = await createAuthenticatedUser();

    const response = await request(app.getHttpServer())
      .post('/api/v1/uploads/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', validJpeg(), {
        filename: 'profile.php.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(201);

    uploadIds.push(response.body.id);

    const stored = await prisma.storedUpload.findUnique({
      where: {
        id: response.body.id,
      },
    });

    expect(stored?.storageKey).toMatch(/^[0-9a-f-]{36}\.jpg$/);

    expect(stored?.storageKey).not.toContain('profile');

    storageKeys.push(stored!.storageKey);
  });
});
