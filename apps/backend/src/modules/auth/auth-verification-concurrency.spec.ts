import 'dotenv/config';

import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

import { AuthService } from './auth.service';
import { VerificationTokenRepository } from './repositories/verification-token.repository';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import { VerificationTokenType } from '@prisma/client';

describe('Verification token atomic single-use concurrency', () => {
  let prisma: PrismaService;
  let repository: VerificationTokenRepository;
  let uidCounter = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new VerificationTokenRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function uniqueUserData() {
    uidCounter += 1;
    const uid =
      Date.now().toString().slice(-9) +
      String(uidCounter).slice(-1);

    return {
      uid,
      email: `verification-concurrency-${Date.now()}-${uidCounter}@example.com`,
      phone: `+2348${Date.now().toString().slice(-9)}`,
      passwordHash: 'test-password-hash',
      firstName: 'Concurrency',
      lastName: 'Test',
    };
  }

  async function createUser() {
    return prisma.user.create({
      data: uniqueUserData(),
    });
  }

  function createAuthService() {
    return new AuthService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      prisma,
      repository,
    );
  }

  test('repository claim: exactly one concurrent caller consumes an email token', async () => {
    const user = await createUser();

    try {
      const token = await repository.create(
        user.id,
        randomBytes(16).toString('hex'),
        'test-hash',
        VerificationTokenType.EMAIL_VERIFICATION,
        new Date(Date.now() + 10 * 60 * 1000),
      );

      const results = await Promise.all(
        Array.from({ length: 32 }, () =>
          repository.consumeIfUnused(token.id),
        ),
      );

      const winners = results.filter(
        (result: { count: number }) => result.count === 1,
      ).length;

      expect(winners).toBe(1);

      const stored = await prisma.verificationToken.findUnique({
        where: { id: token.id },
        select: { consumedAt: true },
      });

      expect(stored?.consumedAt).not.toBeNull();
    } finally {
      await prisma.user.delete({
        where: { id: user.id },
      });
    }
  });

  test('email confirmation: concurrent valid confirmations have exactly one winner', async () => {
    const user = await createUser();
    const secret = 'EmailConcurrency2026';
    const selector = randomBytes(16).toString('hex');
    const tokenHash = await argon2.hash(secret);

    try {
      await repository.create(
        user.id,
        selector,
        tokenHash,
        VerificationTokenType.EMAIL_VERIFICATION,
        new Date(Date.now() + 10 * 60 * 1000),
      );

      const service = createAuthService();
      const verificationToken = `${selector}.${secret}`;

      const results = await Promise.allSettled([
        service.confirmEmailVerification({ verificationToken }),
        service.confirmEmailVerification({ verificationToken }),
      ]);

      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = results.filter(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof UnauthorizedException,
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const finalUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          emailVerified: true,
          emailVerifiedAt: true,
        },
      });

      const finalToken = await prisma.verificationToken.findUnique({
        where: { selector },
        select: { consumedAt: true },
      });

      expect(finalUser?.emailVerified).toBe(true);
      expect(finalUser?.emailVerifiedAt).not.toBeNull();
      expect(finalToken?.consumedAt).not.toBeNull();
    } finally {
      await prisma.user.delete({
        where: { id: user.id },
      });
    }
  });

  test('phone confirmation: concurrent valid confirmations have exactly one winner', async () => {
    const user = await createUser();
    const code = '482731';
    const selector = randomBytes(16).toString('hex');
    const tokenHash = await argon2.hash(code);

    try {
      await repository.create(
        user.id,
        selector,
        tokenHash,
        VerificationTokenType.PHONE_VERIFICATION,
        new Date(Date.now() + 10 * 60 * 1000),
      );

      const service = createAuthService();

      const results = await Promise.allSettled([
        service.confirmPhoneVerification({
          selector,
          verificationCode: code,
        }),
        service.confirmPhoneVerification({
          selector,
          verificationCode: code,
        }),
      ]);

      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = results.filter(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof UnauthorizedException,
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const finalUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          phoneVerified: true,
          phoneVerifiedAt: true,
        },
      });

      const finalToken = await prisma.verificationToken.findUnique({
        where: { selector },
        select: { consumedAt: true },
      });

      expect(finalUser?.phoneVerified).toBe(true);
      expect(finalUser?.phoneVerifiedAt).not.toBeNull();
      expect(finalToken?.consumedAt).not.toBeNull();
    } finally {
      await prisma.user.delete({
        where: { id: user.id },
      });
    }
  });
});
