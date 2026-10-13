import { UnauthorizedException } from '@nestjs/common';

import { JwtStrategy } from '../../modules/auth/strategies/jwt.strategy';

describe('ONE-BUSINESS — account-state authorization invariants', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET =
      originalSecret ?? 'test-secret-for-business-logic-security';
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('rejects JWTs without a subject', async () => {
    const userService = {
      findAuthUserById: jest.fn(),
    };

    const strategy = new JwtStrategy(userService as never);

    await expect(
      strategy.validate({
        sub: '',
        tokenVersion: 0,
        uid: 'USER12345',
        email: 'user@example.com',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(userService.findAuthUserById).not.toHaveBeenCalled();
  });

  it('rejects tokens for users that no longer exist', async () => {
    const userService = {
      findAuthUserById: jest.fn().mockResolvedValue(null),
    };

    const strategy = new JwtStrategy(userService as never);

    await expect(
      strategy.validate({
        sub: 'deleted-user-id',
        tokenVersion: 0,
        uid: 'USER12345',
        email: 'user@example.com',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(userService.findAuthUserById).toHaveBeenCalledWith(
      'deleted-user-id',
    );
  });

  it('rejects tokens for suspended accounts', async () => {
    const userService = {
      findAuthUserById: jest.fn().mockResolvedValue({
        id: 'user-1',
        uid: 'USER12345',
        email: 'user@example.com',
        status: 'SUSPENDED',
        deletedAt: null,
      }),
    };

    const strategy = new JwtStrategy(userService as never);

    await expect(
      strategy.validate({
        sub: 'user-1',
        tokenVersion: 0,
        uid: 'ATTACKER_CLAIM',
        email: 'attacker@example.com',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses database identity instead of trusting JWT uid/email claims', async () => {
    const userService = {
      findAuthUserById: jest.fn().mockResolvedValue({
        id: 'user-1',
        uid: 'REALUSER01',
        email: 'real@example.com',
        status: 'ACTIVE',
        tokenVersion: 0,
        emailVerified: true,
        phoneVerified: true,
        deletedAt: null,
      }),
    };

    const strategy = new JwtStrategy(userService as never);

    const result = await strategy.validate({
      sub: 'user-1',
      tokenVersion: 0,
      uid: 'FORGEDUID',
      email: 'forged@example.com',
    });

    expect(result).toEqual({
      id: 'user-1',
      uid: 'REALUSER01',
      email: 'real@example.com',
      status: 'ACTIVE',
      emailVerified: true,
      phoneVerified: true,
    });
  });

  it('rejects tokens for soft-deleted accounts', async () => {
    const userService = {
      findAuthUserById: jest.fn().mockResolvedValue({
        id: 'user-1',
        uid: 'REALUSER01',
        email: 'real@example.com',
        status: 'ACTIVE',
        tokenVersion: 0,
        emailVerified: true,
        phoneVerified: true,
        deletedAt: new Date(),
      }),
    };

    const strategy = new JwtStrategy(userService as never);

    await expect(
      strategy.validate({
        sub: 'user-1',
        tokenVersion: 0,
        uid: 'REALUSER01',
        email: 'real@example.com',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
