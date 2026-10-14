import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { randomBytes, randomInt } from 'crypto';
import * as argon2 from 'argon2';

import { AppModule } from '../../bootstrap/app.module';
import { PrismaService } from '@/infrastructure/database/prisma';

type JsonObject = Record<string, unknown>;

const FORBIDDEN_FIELDS = [
  'passwordHash',
  'refreshTokenHash',
  'tokenVersion',
  'failedLoginAttempts',
  'lockedUntil',
  'deletedAt',
  'sessions',
  'roles',
  'securityEvents',
  'verificationTokens',
  'passwordResetTokens',
  'developmentVerificationToken',
  'developmentVerificationSelector',
  'developmentVerificationCode',
];

describe('ONE-107.12 comprehensive authentication security', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let prisma: PrismaService;
  let baseUrl = '';

  const createdUserIds: string[] = [];
  let userSequence = 0;

  function uniqueIdentity() {
    userSequence += 1;

    const stamp = `${Date.now()}-${userSequence}`;

    return {
      email: `authsec-${stamp}@example.com`,
      phone: `+2348${String(Date.now()).slice(-8)}${String(
        userSequence,
      ).padStart(2, '0')}`,
      password: 'AuthSecurity2026!',
    };
  }

  async function http(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, options);
  }

  async function body(
    response: Response,
  ): Promise<JsonObject> {
    return (await response.json()) as JsonObject;
  }

  async function registerUser() {
    const identity = uniqueIdentity();

    const response = await http('/api/v1/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: identity.email,
        phone: identity.phone,
        password: identity.password,
        firstName: 'Auth',
        lastName: 'Security',
      }),
    });

    expect(response.status).toBe(201);

    const result = await body(response);

    const id = String(result.id);
    createdUserIds.push(id);

    return {
      ...identity,
      id,
      response: result,
    };
  }

  async function createVerificationToken(
    userId: string,
    type:
      | 'EMAIL_VERIFICATION'
      | 'PHONE_VERIFICATION',
    secret: string,
  ) {
    const selector = randomBytes(16).toString('hex');

    const tokenHash = await argon2.hash(secret);

    await prisma.verificationToken.create({
      data: {
        userId,
        selector,
        tokenHash,
        type,
        expiresAt: new Date(
          Date.now() + 10 * 60 * 1000,
        ),
      },
    });

    return {
      selector,
      emailToken:
        type === 'EMAIL_VERIFICATION'
          ? `${selector}.${secret}`
          : null,
    };
  }

  function assertNoForbiddenFields(
    value: unknown,
  ): void {
    if (
      value === null ||
      typeof value !== 'object'
    ) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        assertNoForbiddenFields(item);
      }

      return;
    }

    const object = value as Record<
      string,
      unknown
    >;

    for (const field of FORBIDDEN_FIELDS) {
      expect(object).not.toHaveProperty(field);
    }

    for (const child of Object.values(object)) {
      assertNoForbiddenFields(child);
    }
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    app.getHttpAdapter().getInstance().disable('x-powered-by');

    app.setGlobalPrefix('api/v1');

    const expressApp =
      app.getHttpAdapter().getInstance();

    // Match safe default for tests: do not trust forwarded headers.
    expressApp.set('trust proxy', false);

    await app.listen(0, '127.0.0.1');

    const url = await app.getUrl();
    baseUrl = url;

    prisma = app.get(PrismaService);

    const health = await http('/api/v1/health');

    expect(health.ok).toBe(true);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: createdUserIds,
          },
        },
      });
    }

    await app.close();
  });

  test('registration response exposes only approved public fields', async () => {
    const user = await registerUser();

    expect(Object.keys(user.response).sort()).toEqual([
      'createdAt',
      'email',
      'emailVerified',
      'firstName',
      'id',
      'lastName',
      'phone',
      'phoneVerified',
      'status',
      'uid',
    ]);

    assertNoForbiddenFields(user.response);
  });

  test('login response exposes no sensitive authentication state', async () => {
    const user = await registerUser();

    const response = await http('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
      }),
    });

    expect(response.status).toBe(201);

    const result = await body(response);

    expect(result.authenticated).toBe(true);
    expect(result.accessToken).toEqual(
      expect.any(String),
    );
    expect(result.refreshToken).toEqual(
      expect.any(String),
    );

    assertNoForbiddenFields(result);
  });

  test('invalid login remains generic and reaches lock threshold', async () => {
    const user = await registerUser();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await http(
        '/api/v1/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: user.email,
            password: 'WrongPassword2026!',
          }),
        },
      );

      expect(response.status).toBe(401);

      const result = await body(response);

      expect(result.message).toBe(
        'Invalid email or password',
      );
    }

    const stored = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    expect(stored).not.toBeNull();
    expect(
      stored!.failedLoginAttempts,
    ).toBeGreaterThanOrEqual(5);
    expect(stored!.lockedUntil).not.toBeNull();
  });

  test('malformed refresh tokens are rejected', async () => {
    const response = await http(
      '/api/v1/auth/refresh',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: 'invalid-refresh-token',
        }),
      },
    );

    expect(response.status).toBe(401);
  });

  test('refresh rotation succeeds and old token is rejected', async () => {
    const user = await registerUser();

    const login = await http('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
      }),
    });

    expect(login.status).toBe(201);

    const loginBody = await body(login);

    const oldRefreshToken = String(
      loginBody.refreshToken,
    );

    const refresh = await http(
      '/api/v1/auth/refresh',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: oldRefreshToken,
        }),
      },
    );

    expect(refresh.status).toBe(201);

    const refreshBody = await body(refresh);

    expect(refreshBody.authenticated).toBe(true);
    expect(refreshBody.accessToken).toEqual(
      expect.any(String),
    );
    expect(refreshBody.refreshToken).toEqual(
      expect.any(String),
    );
    expect(refreshBody.refreshToken).not.toBe(
      oldRefreshToken,
    );

    assertNoForbiddenFields(refreshBody);

    const replay = await http(
      '/api/v1/auth/refresh',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: oldRefreshToken,
        }),
      },
    );

    expect(replay.status).toBe(401);
  });

  test('email verification failure is audited without storing the secret', async () => {
    const user = await registerUser();

    const secret = `EmailSecret-${randomBytes(
      16,
    ).toString('hex')}`;

    const token = await createVerificationToken(
      user.id,
      'EMAIL_VERIFICATION',
      secret,
    );

    const response = await http(
      '/api/v1/auth/email-verification/confirm',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'ONECALL-AUTH-SECURITY-TEST',
        },
        body: JSON.stringify({
          verificationToken:
            `${token.emailToken!.split('.')[0]}.wrong-secret`,
        }),
      },
    );

    expect(response.status).toBe(401);

    const event =
      await prisma.securityEvent.findFirst({
        where: {
          userId: user.id,
          type: 'EMAIL_VERIFICATION_FAILED',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(event).not.toBeNull();
    expect(event!.ipAddress).toBeTruthy();
    expect(event!.userAgent).toBe(
      'ONECALL-AUTH-SECURITY-TEST',
    );

    const metadata =
      event!.metadata as Record<
        string,
        unknown
      > | null;

    expect(
      JSON.stringify(metadata ?? {}),
    ).not.toContain(secret);
  });

  test('phone verification failure is audited without storing the code', async () => {
    const user = await registerUser();

    const code = String(
      randomInt(100000, 1000000),
    );

    const token = await createVerificationToken(
      user.id,
      'PHONE_VERIFICATION',
      code,
    );

    const response = await http(
      '/api/v1/auth/phone-verification/confirm',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'ONECALL-AUTH-SECURITY-TEST',
        },
        body: JSON.stringify({
          selector: token.selector,
          verificationCode: '000000',
        }),
      },
    );

    expect(response.status).toBe(401);

    const event =
      await prisma.securityEvent.findFirst({
        where: {
          userId: user.id,
          type: 'PHONE_VERIFICATION_FAILED',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(event).not.toBeNull();
    expect(event!.ipAddress).toBeTruthy();
    expect(event!.userAgent).toBe(
      'ONECALL-AUTH-SECURITY-TEST',
    );

    const metadata =
      event!.metadata as Record<
        string,
        unknown
      > | null;

    expect(
      JSON.stringify(metadata ?? {}),
    ).not.toContain(code);
  });

  test('email verification is single-use after success', async () => {
    const user = await registerUser();

    const secret = `EmailSecret-${randomBytes(
      16,
    ).toString('hex')}`;

    const token = await createVerificationToken(
      user.id,
      'EMAIL_VERIFICATION',
      secret,
    );

    const first = await http(
      '/api/v1/auth/email-verification/confirm',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verificationToken:
            token.emailToken,
        }),
      },
    );

    expect(first.status).toBe(201);

    const replay = await http(
      '/api/v1/auth/email-verification/confirm',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verificationToken:
            token.emailToken,
        }),
      },
    );

    expect(replay.status).toBe(401);

    const stored = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        emailVerified: true,
      },
    });

    expect(stored?.emailVerified).toBe(true);
  });

  test('phone verification is single-use after success', async () => {
    const user = await registerUser();

    const code = String(
      randomInt(100000, 1000000),
    );

    const token = await createVerificationToken(
      user.id,
      'PHONE_VERIFICATION',
      code,
    );

    const first = await http(
      '/api/v1/auth/phone-verification/confirm',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selector: token.selector,
          verificationCode: code,
        }),
      },
    );

    expect(first.status).toBe(201);

    const replay = await http(
      '/api/v1/auth/phone-verification/confirm',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selector: token.selector,
          verificationCode: code,
        }),
      },
    );

    expect(replay.status).toBe(401);

    const stored = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        phoneVerified: true,
      },
    });

    expect(stored?.phoneVerified).toBe(true);
  });

  test('health response does not expose x-powered-by', async () => {
    const response = await http(
      '/api/v1/health',
    );

    expect(response.headers.get('x-powered-by'))
      .toBeNull();
  });

  test('auth responses contain no forbidden fields recursively', async () => {
    const user = await registerUser();

    const login = await http('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
      }),
    });

    const result = await body(login);

    assertNoForbiddenFields(result);
  });

  test('failed email verification cannot verify the user', async () => {
    const user = await registerUser();

    const secret = `EmailSecret-${randomBytes(
      16,
    ).toString('hex')}`;

    const token = await createVerificationToken(
      user.id,
      'EMAIL_VERIFICATION',
      secret,
    );

    const response = await http(
      '/api/v1/auth/email-verification/confirm',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verificationToken:
            `${token.emailToken!.split('.')[0]}.wrong`,
        }),
      },
    );

    expect(response.status).toBe(401);

    const stored = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        emailVerified: true,
      },
    });

    expect(stored?.emailVerified).toBe(false);
  });
});
