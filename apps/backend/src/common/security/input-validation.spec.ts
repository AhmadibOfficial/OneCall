import {
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';

import { EmailVerificationConfirmDto } from '@/modules/auth/dto/email-verification-confirm.dto';
import { LoginDto } from '@/modules/auth/dto/login.dto';
import { PasswordResetConfirmDto } from '@/modules/auth/dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from '@/modules/auth/dto/password-reset-request.dto';
import { PhoneVerificationConfirmDto } from '@/modules/auth/dto/phone-verification-confirm.dto';
import { RefreshDto } from '@/modules/auth/dto/refresh.dto';
import { RegisterDto } from '@/modules/auth/dto/register.dto';

describe('ONE-INPUT — input validation and mass-assignment security', () => {
  const pipe = new ValidationPipe({
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
  });

  async function validate<T>(
    metatype: new () => T,
    payload: unknown,
  ) {
    return pipe.transform(payload, {
      type: 'body',
      metatype,
    });
  }

  async function expectRejected(
    metatype: new () => unknown,
    payload: unknown,
  ) {
    await expect(
      validate(metatype, payload),
    ).rejects.toBeInstanceOf(
      BadRequestException,
    );
  }

  it('accepts a valid registration payload', async () => {
    await expect(
      validate(RegisterDto, {
        email: 'user@example.com',
        phone: '+2348012345678',
        password: 'Password123',
        firstName: 'Ahmad',
        lastName: 'Ibrahim',
      }),
    ).resolves.toMatchObject({
      email: 'user@example.com',
      phone: '+2348012345678',
      password: 'Password123',
      firstName: 'Ahmad',
      lastName: 'Ibrahim',
    });
  });

  it('rejects mass-assignment fields during registration', async () => {
    await expectRejected(RegisterDto, {
      email: 'user@example.com',
      phone: '+2348012345678',
      password: 'Password123',
      firstName: 'Ahmad',
      lastName: 'Ibrahim',
      status: 'ADMIN',
    });
  });

  it('rejects identity and security field injection during registration', async () => {
    await expectRejected(RegisterDto, {
      email: 'user@example.com',
      phone: '+2348012345678',
      password: 'Password123',
      firstName: 'Ahmad',
      lastName: 'Ibrahim',
      id: 'attacker-id',
      uid: 'ATTACK0001',
      tokenVersion: 999,
      emailVerified: true,
      phoneVerified: true,
      failedLoginAttempts: 0,
      deletedAt: null,
      roles: ['ADMIN'],
    });
  });

  it('prevents __proto__ prototype pollution', async () => {
    delete (Object.prototype as { status?: unknown }).status;

    const payload = JSON.parse(`{
      "email": "user@example.com",
      "phone": "+2348012345678",
      "password": "Password123",
      "firstName": "Ahmad",
      "lastName": "Ibrahim",
      "__proto__": {
        "status": "ADMIN"
      }
    }`);

    const validated = await validate(
      RegisterDto,
      payload,
    );

    expect(validated).toEqual({
      email: 'user@example.com',
      phone: '+2348012345678',
      password: 'Password123',
      firstName: 'Ahmad',
      lastName: 'Ibrahim',
    });

    expect(
      (Object.prototype as { status?: unknown }).status,
    ).toBeUndefined();

    expect(
      Object.prototype.hasOwnProperty.call(
        validated,
        '__proto__',
      ),
    ).toBe(false);

    delete (Object.prototype as { status?: unknown }).status;
  });

  it('rejects incorrect primitive types', async () => {
    await expectRejected(LoginDto, {
      email: 12345,
      password: 'Password123',
    });

    await expectRejected(LoginDto, {
      email: 'user@example.com',
      password: 12345678,
    });

    await expectRejected(RegisterDto, {
      email: 'user@example.com',
      phone: '+2348012345678',
      password: 'Password123',
      firstName: 123,
      lastName: 'Ibrahim',
    });
  });

  it('does not implicitly convert primitive values', async () => {
    await expectRejected(RefreshDto, {
      refreshToken: 123456,
    });
  });

  it('rejects unknown fields on refresh', async () => {
    await expectRejected(RefreshDto, {
      refreshToken: 'refresh-token',
      userId: 'another-user',
      tokenVersion: 999,
    });
  });

  it('accepts a valid password reset request', async () => {
    await expect(
      validate(PasswordResetRequestDto, {
        email: 'user@example.com',
      }),
    ).resolves.toBeDefined();
  });

  it('rejects invalid password reset requests', async () => {
    await expectRejected(
      PasswordResetRequestDto,
      {
        email: 'not-an-email',
      },
    );
  });

  it('rejects invalid password reset confirmation', async () => {
    await expectRejected(
      PasswordResetConfirmDto,
      {
        resetToken: '',
        newPassword: 'weak',
      },
    );

    await expectRejected(
      PasswordResetConfirmDto,
      {
        resetToken: 'valid-token',
        newPassword: '12345678',
      },
    );
  });

  it('rejects unknown fields on password reset confirmation', async () => {
    await expectRejected(
      PasswordResetConfirmDto,
      {
        resetToken: 'valid-token',
        newPassword: 'Password123',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    );
  });

  it('rejects invalid email verification token input', async () => {
    await expectRejected(
      EmailVerificationConfirmDto,
      {
        verificationToken: '',
      },
    );

    await expectRejected(
      EmailVerificationConfirmDto,
      {
        verificationToken: 'A'.repeat(4097),
      },
    );
  });

  it('rejects invalid phone verification codes', async () => {
    await expectRejected(
      PhoneVerificationConfirmDto,
      {
        selector: 'selector',
        verificationCode: '12345',
      },
    );

    await expectRejected(
      PhoneVerificationConfirmDto,
      {
        selector: 'selector',
        verificationCode: 'abcdef',
      },
    );
  });

  it('rejects unexpected verification fields', async () => {
    await expectRejected(
      PhoneVerificationConfirmDto,
      {
        selector: 'selector',
        verificationCode: '123456',
        userId: 'attacker',
        phoneVerified: true,
      },
    );

    await expectRejected(
      EmailVerificationConfirmDto,
      {
        verificationToken: 'valid-token',
        userId: 'attacker',
        emailVerified: true,
      },
    );
  });

  it('rejects non-object request bodies', async () => {
    await expectRejected(
      LoginDto,
      null,
    );

    await expectRejected(
      RegisterDto,
      'username=password',
    );

    await expectRejected(
      RefreshDto,
      [],
    );
  });
});
