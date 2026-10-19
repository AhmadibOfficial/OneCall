import * as argon from 'argon2';
import type { Server } from 'node:http';
type Session = {
  accessToken: string;
  refreshToken: string;
  user: { uid: string };
};
type Me = { user: { phoneVerified: boolean; emailVerified: boolean } };
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/bootstrap/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';
import { PrismaService } from '../src/infrastructure/database/prisma';
import { AuthService } from '../src/modules/auth/auth.service';
import {
  SocialVerifier,
  SocialProvider,
} from '../src/modules/auth/social/social-verifier';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';

describe('Social authentication: real HTTP/database, mocked provider verification', () => {
  let app: INestApplication<Server>, prisma: PrismaService, auth: AuthService;
  const stamp = randomBytes(6).toString('hex');
  let n = 0;
  let redis: Redis;
  let prefix: string;
  const verifier = {
    enabled: () => true,
    notice: jest.fn(),
    verify: jest.fn((provider: SocialProvider, token: string) => {
      if (token.startsWith('invalid'))
        throw new UnauthorizedException('Could not verify');
      return {
        provider,
        subject: token,
        email: `${token}@gmail.com`,
        emailVerified: true,
      };
    }),
  };
  const token = () => `social-${stamp}-${++n}-credential`;
  const post = (path: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/social/' + path);
  async function begin(provider = 'google') {
    return (await post('challenge').send({ provider }).expect(201)).body as {
      challenge: string;
      nonce: string;
    };
  }
  async function signup(idToken = token()) {
    const challenge = await begin();
    const exchange = await post('exchange')
      .send({ provider: 'google', idToken, challenge: challenge.challenge })
      .expect(201);
    const details = {
      ticket: (exchange.body as { ticket: string }).ticket,
      firstName: 'Social',
      lastName: 'Customer',
      phone:
        '+2348' + String(Date.now()).slice(-7) + String(++n).padStart(2, '0'),
    };
    const complete = await post('complete').send(details).expect(201);
    return { session: complete.body as Session, details, idToken, challenge };
  }
  beforeAll(async () => {
    if (process.env.ONECALL_ALLOW_TEST_DATABASE !== 'true')
      throw new Error('Use disposable database only');
    redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
    await redis.ping();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SocialVerifier)
      .useValue(verifier)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    prefix = app.get(ConfigService).getOrThrow<string>('THROTTLE_KEY_PREFIX');
  });
  beforeEach(async () => {
    const keys = await redis.keys(prefix + '*');
    if (keys.length) await redis.del(...keys);
  });
  afterAll(async () => {
    const keys = await redis.keys(prefix + '*');
    if (keys.length) await redis.del(...keys);
    redis.disconnect();
    await app?.close();
  });
  it('configuration exposes flags only', async () => {
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/auth/social/configuration')
          .expect(200)
      ).body,
    ).toMatchObject({ google: true, apple: true });
  });
  it('signup creates pending phone verification, preserves booking guard, and ticket cannot replay', async () => {
    const result = await signup();
    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer ' + result.session.accessToken)
      .expect(200);
    expect((me.body as Me).user.phoneVerified).toBe(false);
    expect((me.body as Me).user.emailVerified).toBe(true);
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer ' + result.session.accessToken)
      .send({
        serviceName: 'Plumbing',
        state: 'Kaduna',
        city: 'Kaduna',
        address: 'Test address Kaduna',
      })
      .expect(403);
    await post('complete').send(result.details).expect(401);
    await post('exchange')
      .send({
        provider: 'google',
        idToken: result.idToken,
        challenge: result.challenge.challenge,
      })
      .expect(401);
  });
  it('linked identity returns same account and respects logout revocation', async () => {
    const result = await signup();
    const next = await begin();
    const login = await post('exchange')
      .send({
        provider: 'google',
        idToken: result.idToken,
        challenge: next.challenge,
      })
      .expect(201);
    expect((login.body as Session).user.uid).toBe(result.session.user.uid);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer ' + (login.body as Session).accessToken)
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer ' + (login.body as Session).accessToken)
      .expect(401);
  });
  it('does not automatically link by matching email; explicit authenticated link preserves account fields', async () => {
    const credential = token();
    const registered = await auth.register({
      email: credential + '@gmail.com',
      phone:
        '+2349' + String(Date.now()).slice(-7) + String(++n).padStart(2, '0'),
      firstName: 'Existing',
      lastName: 'Account',
      password: 'ExistingPassword123!',
    });
    const session = await auth.login({
      email: registered.email,
      password: 'ExistingPassword123!',
    });
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: registered.id },
    });
    await post('exchange')
      .send({
        provider: 'google',
        idToken: credential,
        challenge: (await begin()).challenge,
      })
      .expect(409);
    await post('link')
      .send({
        provider: 'google',
        idToken: credential,
        challenge: (await begin()).challenge,
      })
      .expect(401);
    await post('link')
      .set('Authorization', 'Bearer ' + session.accessToken)
      .send({
        provider: 'google',
        idToken: credential,
        challenge: (await begin()).challenge,
      })
      .expect(201);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: registered.id },
    });
    expect(after.email).toBe(before.email);
    expect(after.phone).toBe(before.phone);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.phoneVerified).toBe(before.phoneVerified);
    const login = await post('exchange')
      .send({
        provider: 'google',
        idToken: credential,
        challenge: (await begin()).challenge,
      })
      .expect(201);
    expect((login.body as Session).user.uid).toBe(registered.uid);
  });
  it('does not permit another account to claim an already linked identity', async () => {
    const owner = await signup(),
      other = await signup();
    await post('link')
      .set('Authorization', 'Bearer ' + other.session.accessToken)
      .send({
        provider: 'google',
        idToken: owner.idToken,
        challenge: (await begin()).challenge,
      })
      .expect(409);
  });
  it.each(['SUSPENDED', 'DEACTIVATED'] as const)(
    'blocks %s linked accounts',
    async (status) => {
      const result = await signup();
      await prisma.user.update({
        where: { uid: result.session.user.uid },
        data: { status },
      });
      await post('exchange')
        .send({
          provider: 'google',
          idToken: result.idToken,
          challenge: (await begin()).challenge,
        })
        .expect(401);
    },
  );
  it('rejects expired challenge and wrong provider before contacting verifier', async () => {
    const attempt = await begin();
    const id = attempt.challenge.split('.')[0];
    await prisma.socialAuthChallenge.update({
      where: { id },
      data: { expiresAt: new Date(0) },
    });
    await post('exchange')
      .send({
        provider: 'google',
        idToken: token(),
        challenge: attempt.challenge,
      })
      .expect(401);
    await post('exchange')
      .send({
        provider: 'apple',
        idToken: token(),
        challenge: (await begin()).challenge,
      })
      .expect(401);
  });
  it('rejects forged client subject/email and invalid phone through DTO validation', async () => {
    await post('exchange')
      .send({
        provider: 'google',
        idToken: token(),
        challenge: (await begin()).challenge,
        subject: 'owner',
        email: 'admin@example.com',
      })
      .expect(400);
    await post('complete')
      .send({
        ticket: 'not-a-valid-ticket',
        firstName: 'Social',
        lastName: 'Customer',
        phone: '08012345678',
      })
      .expect(400);
  });
  it('rate limits real challenge requests', async () => {
    for (let i = 0; i < 10; i++) await begin();
    await post('challenge').send({ provider: 'google' }).expect(429);
  });
  it('linked account list is owner-only and omits provider subjects', async () => {
    const owner = await signup(),
      other = await signup();
    const list = await request(app.getHttpServer())
      .get('/api/v1/auth/social/linked')
      .set('Authorization', 'Bearer ' + owner.session.accessToken)
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ provider: 'google' }),
    ]);
    expect(JSON.stringify(list.body)).not.toContain(owner.idToken);
    const otherList = await request(app.getHttpServer())
      .get('/api/v1/auth/social/linked')
      .set('Authorization', 'Bearer ' + other.session.accessToken)
      .expect(200);
    expect(JSON.stringify(otherList.body)).not.toContain(owner.idToken);
    await post('unlink')
      .set('Authorization', 'Bearer ' + owner.session.accessToken)
      .send({ provider: 'google', password: 'UnknownPassword123!' })
      .expect(403);
    expect(
      await prisma.socialIdentity.count({ where: { subject: owner.idToken } }),
    ).toBe(1);
  });
  it('unlink requires a working password and revokes access and refresh without changing bookings or credentials', async () => {
    const result = await signup();
    const user = await prisma.user.findUniqueOrThrow({
      where: { uid: result.session.user.uid },
    });
    const hash = await argon.hash('RecoveryPassword123!');
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash },
    });
    await post('unlink')
      .set('Authorization', 'Bearer ' + result.session.accessToken)
      .send({ provider: 'google', password: 'RecoveryPassword123!' })
      .expect(201);
    expect(
      await prisma.socialIdentity.count({ where: { userId: user.id } }),
    ).toBe(0);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer ' + result.session.accessToken)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: result.session.refreshToken })
      .expect(401);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .passwordHash,
    ).toBe(hash);
  });
  it('Apple revocation removes only its link, revokes sessions and handles duplicate notices', async () => {
    const account=await signup();
    const user=await prisma.user.findUniqueOrThrow({where:{uid:account.session.user.uid}});
    const subject=token();
    await prisma.socialIdentity.create({data:{userId:user.id,provider:'apple',subject,authorizedAt:new Date(Date.now()-60000)}});
    verifier.notice.mockResolvedValue({jti:token(),type:'consent-revoked',subject,time:Math.floor(Date.now()/1000)});
    await post('apple/notifications').send({payload:'mock-signed-notice'}).expect(201);
    await post('apple/notifications').send({payload:'mock-signed-notice'}).expect(201);
    expect(await prisma.socialIdentity.count({where:{userId:user.id,provider:'apple'}})).toBe(0);
    expect(await prisma.socialIdentity.count({where:{userId:user.id,provider:'google'}})).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).tokenVersion).toBe(user.tokenVersion+1);
    await request(app.getHttpServer()).get('/api/v1/users/me').set('Authorization','Bearer '+account.session.accessToken).expect(401);
  });
  it('privacy requests and snapshots stay within the signed-in account', async () => {
    const owner = await signup(),
      other = await signup();
    const path = '/api/v1/account/privacy/requests';
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + owner.session.accessToken)
      .send({
        kind: 'DELETION',
        message: 'Please review my data deletion request.',
      })
      .expect(201);
    const list = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer ' + other.session.accessToken)
      .expect(200);
    expect(list.body).toEqual([]);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + owner.session.accessToken)
      .send({ kind: 'DELETION', message: 'Repeat deletion request.' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/account/privacy/snapshot')
      .set('Authorization', 'Bearer ' + owner.session.accessToken)
      .send({ password: 'WrongPassword123!' })
      .expect(403);
    await prisma.user.update({
      where: { uid: owner.session.user.uid },
      data: { passwordHash: await argon.hash('SnapshotPassword123!') },
    });
    const snapshot = await request(app.getHttpServer())
      .post('/api/v1/account/privacy/snapshot')
      .set('Authorization', 'Bearer ' + owner.session.accessToken)
      .send({ password: 'SnapshotPassword123!' })
      .expect(201);
    const text = JSON.stringify(snapshot.body);
    expect(text).toContain(owner.session.user.uid);
    expect(text).not.toContain(other.session.user.uid);
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('refreshToken');
  });
  it('booking photo upload, private read, type limits and closed-booking boundary', async () => {
    const owner = await signup(),
      outsider = await signup();
    const user = await prisma.user.update({
      where: { uid: owner.session.user.uid },
      data: { status: 'ACTIVE', phoneVerified: true, emailVerified: true },
    });
    const order = await prisma.order.create({
      data: {
        customerId: user.id,
        serviceName: 'Plumbing',
        state: 'Kaduna',
        city: 'Kaduna',
        address: 'Private test address',
      },
    });
    const path = '/api/v1/orders/' + order.id + '/photos';
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=',
      'base64',
    );
    const upload = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + owner.session.accessToken)
      .attach('file', png, { filename: 'photo.png', contentType: 'image/png' })
      .expect(201);
    const id = (upload.body as { id: string }).id;
    const list = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer ' + owner.session.accessToken)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('storageKey');
    await request(app.getHttpServer())
      .get(path + '/' + id)
      .set('Authorization', 'Bearer ' + outsider.session.accessToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(path + '/' + id)
      .set('Authorization', 'Bearer ' + owner.session.accessToken)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + owner.session.accessToken)
      .attach('file', Buffer.from('<svg/>'), {
        filename: 'malware.png',
        contentType: 'image/png',
      })
      .expect(400);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'COMPLETED' },
    });
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + owner.session.accessToken)
      .attach('file', png, { filename: 'photo.png', contentType: 'image/png' })
      .expect(409);
  });
  it('browser callback exposes no session tokens; result proof is one-use and required', async () => {
    const originalFetch = global.fetch;
    const previous = {
      url: process.env.ONECALL_SOCIAL_PUBLIC_API_URL,
      secret: process.env.ONECALL_GOOGLE_CLIENT_SECRET,
      id: process.env.ONECALL_GOOGLE_CLIENT_ID,
    };
    process.env.ONECALL_SOCIAL_PUBLIC_API_URL =
      'https://pilot.example.test/api/v1';
    process.env.ONECALL_GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.ONECALL_GOOGLE_CLIENT_ID = 'test-client-id';
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id_token: token() }))),
    );
    try {
      const begun = await post('challenge')
        .send({ provider: 'google', browser: true })
        .expect(201);
      const data = begun.body as {
        challenge: string;
        authorizationUrl: string;
      };
      const uri = new URL(data.authorizationUrl);
      expect(uri.origin).toBe('https://accounts.google.com');
      expect(uri.searchParams.get('code_challenge_method')).toBe('S256');
      expect(data.authorizationUrl).not.toContain(data.challenge.split('.')[1]);
      const state = uri.searchParams.get('state')!;
      await post('browser/result')
        .send({ challenge: state + '.' + '0'.repeat(64) })
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/auth/social/callback/google')
        .query({ state, code: 'provider-test-code' })
        .expect(200);
      const stored = await prisma.socialAuthChallenge.findUniqueOrThrow({
        where: { id: state },
      });
      expect(stored.resultEncrypted).not.toContain('ticket');
      const polled = await post('browser/result')
        .send({ challenge: data.challenge })
        .expect(201);
      expect(polled.body as object).toHaveProperty('profileRequired', true);
      await post('browser/result')
        .send({ challenge: data.challenge })
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/auth/social/callback/google')
        .query({ state, code: 'provider-test-code' })
        .expect(401);
    } finally {
      global.fetch = originalFetch;
      for (const [key, val] of [
        ['ONECALL_SOCIAL_PUBLIC_API_URL', previous.url],
        ['ONECALL_GOOGLE_CLIENT_SECRET', previous.secret],
        ['ONECALL_GOOGLE_CLIENT_ID', previous.id],
      ]) {
        if (val === undefined) delete process.env[key!];
        else process.env[key!] = val;
      }
    }
  });
});
