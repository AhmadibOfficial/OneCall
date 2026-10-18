import {
  toLoginUserResponse,
  toRegistrationUserResponse,
} from '@/modules/auth/mappers/auth-response.mapper';

import { UserMapper } from '@/modules/user/mappers/user.mapper';

const sensitiveFields = [
  'passwordHash',
  'refreshTokenHash',
  'tokenVersion',
  'failedLoginAttempts',
  'lockedUntil',
  'deletedAt',
  'securityEvents',
  'verificationTokens',
  'passwordResetTokens',
  'roles',
  'sessions',
];

describe('ONE-DATA — sensitive response exposure', () => {
  it('never exposes security fields from registration responses', () => {
    const source = {
      id: 'user-1',
      uid: 'USER12345',
      email: 'user@example.com',
      phone: '+2348012345678',
      firstName: 'Ahmad',
      lastName: 'Ibrahim',
      emailVerified: false,
      phoneVerified: false,
      status: 'PENDING',
      createdAt: new Date(),
      passwordHash: 'secret',
      refreshTokenHash: 'secret',
      tokenVersion: 99,
      failedLoginAttempts: 99,
      lockedUntil: new Date(),
      deletedAt: new Date(),
      securityEvents: [],
      verificationTokens: [],
      passwordResetTokens: [],
      roles: ['ADMIN'],
      sessions: [],
    };

    const response = toRegistrationUserResponse(source);

    for (const field of sensitiveFields) {
      expect(
        Object.prototype.hasOwnProperty.call(
          response,
          field,
        ),
      ).toBe(false);
    }
  });

  it('never exposes security fields from login responses', () => {
    const source = {
      id: 'user-1',
      uid: 'USER12345',
      email: 'user@example.com',
      status: 'ACTIVE',
      passwordHash: 'secret',
      refreshTokenHash: 'secret',
      tokenVersion: 99,
      failedLoginAttempts: 99,
      lockedUntil: new Date(),
      deletedAt: new Date(),
      securityEvents: [],
      verificationTokens: [],
      passwordResetTokens: [],
      roles: ['ADMIN'],
      sessions: [],
    };

    const response = toLoginUserResponse(source);

    for (const field of sensitiveFields) {
      expect(
        Object.prototype.hasOwnProperty.call(
          response,
          field,
        ),
      ).toBe(false);
    }
  });

  it('never exposes security fields from /users/me mapping', () => {
    const source = {
      id: 'user-1',
      uid: 'USER12345',
      email: 'user@example.com',
      phone: '+2348012345678',
      firstName: 'Ahmad',
      lastName: 'Ibrahim',
      avatarUrl: null,
      emailVerified: true,
      phoneVerified: true,
      status: 'ACTIVE',
      createdAt: new Date(),

      passwordHash: 'secret',
      refreshTokenHash: 'secret',
      tokenVersion: 99,
      failedLoginAttempts: 99,
      lockedUntil: new Date(),
      deletedAt: null,
      securityEvents: [],
      verificationTokens: [],
      passwordResetTokens: [],
      roles: ['ADMIN'],
      sessions: [],
    };

    const response = UserMapper.toResponse(source);

    for (const field of sensitiveFields) {
      expect(
        Object.prototype.hasOwnProperty.call(
          response,
          field,
        ),
      ).toBe(false);
    }

    expect(response).toEqual({
      id: 'user-1',
      uid: 'USER12345',
      email: 'user@example.com',
      phone: '+2348012345678',
      firstName: 'Ahmad',
      lastName: 'Ibrahim',
      avatarUrl: null,
      emailVerified: true,
      phoneVerified: true,
      status: 'ACTIVE',
      createdAt: source.createdAt,
    });
  });
});
