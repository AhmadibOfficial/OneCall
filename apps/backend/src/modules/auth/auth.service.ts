import { AppleLifecycleService } from './social/apple-lifecycle.service';
import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, VerificationTokenType } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '@/infrastructure/database/prisma';
import { UserService } from '@/modules/user/services/user.service';
import { EmailVerificationConfirmDto } from './dto/email-verification-confirm.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PhoneVerificationConfirmDto } from './dto/phone-verification-confirm.dto';
import { RegisterDto } from './dto/register.dto';
import {
  toLoginUserResponse,
  toRegistrationUserResponse,
} from './mappers/auth-response.mapper';
import { PasswordResetTokenRepository } from './repositories/password-reset-token.repository';
import { SessionRepository } from './repositories/session.repository';
import { VerificationTokenRepository } from './repositories/verification-token.repository';
import { assertAccountAvailable } from './account-policy';
import { assertDeliveryAvailable, deliverChallenge } from './auth-delivery';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PHONE_VERIFICATION_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const LOGIN_MAX_FAILED_ATTEMPTS = 5;
const LOGIN_LOCKOUT_TTL_MS = 15 * 60 * 1000;
const VERIFICATION_MAX_ATTEMPTS = 5;
type AuthAuditContext = { ipAddress: string | null; userAgent: string | null };
const EMPTY_CONTEXT: AuthAuditContext = { ipAddress: null, userAgent: null };

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly sessionRepository: SessionRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly prisma: PrismaService,
    private readonly verificationTokenRepository: VerificationTokenRepository,
    @Optional() private readonly appleLifecycle?: AppleLifecycleService,
  ) {}

  private generateOpaqueToken() {
    const selector = randomBytes(16).toString('hex');
    const secret = randomBytes(64).toString('hex');
    return { selector, secret, token: `${selector}.${secret}` };
  }
  private parseSelectorSecret(value: string) {
    const match = /^([0-9a-f]{32})\.([^\s.]{1,256})$/i.exec(value.trim());
    return match ? { selector: match[1], secret: match[2] } : null;
  }
  // Acquire the user lock before session/token mutations in all four operations.
  private async lockUser(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  }
  private async createSession(tx: Prisma.TransactionClient, userId: string) {
    const generated = this.generateOpaqueToken();
    await tx.session.create({
      data: {
        userId,
        selector: generated.selector,
        tokenHash: await argon2.hash(generated.secret),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return generated.token;
  }
  async register(data: RegisterDto) {
    const user = await this.userService.create({
      email: data.email.trim().normalize('NFC').toLowerCase(),
      phone: data.phone.trim(),
      passwordHash: await argon2.hash(data.password),
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
    });
    return toRegistrationUserResponse(user);
  }
  async login(data: LoginDto) {
    const user = await this.userService.findAuthUserByEmail(
      data.email.trim().normalize('NFC').toLowerCase(),
    );
    if (!user || user.deletedAt || !['PENDING', 'ACTIVE'].includes(user.status))
      throw new UnauthorizedException('Invalid email or password');
    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now)
      throw new UnauthorizedException('Invalid email or password');
    if (user.lockedUntil && user.lockedUntil <= now) {
      await this.prisma.user.updateMany({
        where: { id: user.id, lockedUntil: { lte: now } },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }
    if (!(await argon2.verify(user.passwordHash, data.password))) {
      await this.prisma.$transaction(async (tx) => {
        await this.lockUser(tx, user.id);
        const updated = await tx.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: { increment: 1 } },
          select: { failedLoginAttempts: true },
        });
        if (updated.failedLoginAttempts >= LOGIN_MAX_FAILED_ATTEMPTS) {
          await tx.user.update({
            where: { id: user.id },
            data: { lockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_TTL_MS) },
          });
          await tx.securityEvent.create({
            data: { userId: user.id, type: 'ACCOUNT_LOCKED' },
          });
        }
        await tx.securityEvent.create({
          data: { userId: user.id, type: 'LOGIN_FAILED' },
        });
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, user.id);
      const current = await tx.user.findUnique({ where: { id: user.id } });
      assertAccountAvailable(current);
      if (
        !current ||
        current.passwordHash !== user.passwordHash ||
        (current.lockedUntil && current.lockedUntil > new Date())
      )
        throw new UnauthorizedException('Invalid email or password');
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });
      const accessToken = await this.jwtService.signAsync({
        sub: updated.id,
        uid: updated.uid,
        email: updated.email,
        tokenVersion: updated.tokenVersion,
      });
      const refreshToken = await this.createSession(tx, user.id);
      await tx.securityEvent.create({
        data: { userId: user.id, type: 'LOGIN_SUCCESS' },
      });
      return {
        authenticated: true,
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: ACCESS_TOKEN_TTL,
        user: toLoginUserResponse(updated),
      };
    });
  }
  async socialSession(tx: Prisma.TransactionClient, userId: string) {
    await this.lockUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId } });
    assertAccountAvailable(user);
    if (!user || (user.lockedUntil && user.lockedUntil > new Date()))
      throw new UnauthorizedException('Account is not available');
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      uid: user.uid,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = await this.createSession(tx, user.id);
    await tx.securityEvent.create({
      data: { userId: user.id, type: 'LOGIN_SUCCESS' },
    });
    return {
      authenticated: true,
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL,
      user: toLoginUserResponse(updated),
    };
  }
  async refresh(refreshToken: string) {
    const parsed = this.parseSelectorSecret(refreshToken ?? '');
    if (!parsed) throw new UnauthorizedException('Invalid refresh token');
    const session = await this.sessionRepository.findBySelector(
      parsed.selector,
    );
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !(await argon2.verify(session.tokenHash, parsed.secret))
    )
      throw new UnauthorizedException('Invalid refresh token');
    if (this.appleLifecycle)
      await this.appleLifecycle.checkUser(session.userId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, session.userId);
      const user = await tx.user.findUnique({ where: { id: session.userId } });
      assertAccountAvailable(user);
      if (!user) throw new UnauthorizedException('Invalid refresh token');
      const claimed = await tx.session.updateMany({
        where: {
          id: session.id,
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new UnauthorizedException('Invalid refresh token');
      const accessToken = await this.jwtService.signAsync({
        sub: user.id,
        uid: user.uid,
        email: user.email,
        tokenVersion: user.tokenVersion,
      });
      const replacement = await this.createSession(tx, user.id);
      await tx.securityEvent.create({
        data: { userId: user.id, type: 'REFRESH_TOKEN_REVOKED' },
      });
      return {
        authenticated: true,
        accessToken,
        refreshToken: replacement,
        tokenType: 'Bearer',
        expiresIn: ACCESS_TOKEN_TTL,
        user: toLoginUserResponse(user),
      };
    });
  }
  async requestPasswordReset(data: PasswordResetRequestDto) {
    assertDeliveryAvailable();
    const user = await this.userService.findByEmail(
      data.email.trim().normalize('NFC').toLowerCase(),
    );
    if (!user || user.deletedAt || !['PENDING', 'ACTIVE'].includes(user.status))
      return { accepted: true };
    const generated = this.generateOpaqueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await this.passwordResetTokenRepository.consumeAllForUser(user.id);
    await this.passwordResetTokenRepository.create(
      user.id,
      generated.selector,
      await argon2.hash(generated.secret),
      expiresAt,
    );
    await deliverChallenge({
      kind: 'password-reset',
      recipient: user.email,
      selector: generated.selector,
      secret: generated.secret,
      expiresAt,
    });
    return process.env.NODE_ENV === 'development'
      ? { accepted: true, developmentResetToken: generated.token }
      : { accepted: true };
  }
  async confirmPasswordReset(data: PasswordResetConfirmDto) {
    const parsed = this.parseSelectorSecret(data.resetToken);
    if (!parsed)
      throw new UnauthorizedException('Invalid password reset token');
    const token = await this.passwordResetTokenRepository.findBySelector(
      parsed.selector,
    );
    if (
      !token ||
      token.consumedAt ||
      token.expiresAt <= new Date() ||
      !(await argon2.verify(token.tokenHash, parsed.secret))
    )
      throw new UnauthorizedException('Invalid password reset token');
    const passwordHash = await argon2.hash(data.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, token.userId);
      assertAccountAvailable(
        await tx.user.findUnique({ where: { id: token.userId } }),
      );
      const claimed = await tx.passwordResetToken.updateMany({
        where: {
          id: token.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new UnauthorizedException('Invalid password reset token');
      await tx.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.securityEvent.create({
        data: { userId: token.userId, type: 'PASSWORD_RESET_COMPLETED' },
      });
    });
    return { passwordReset: true, sessionsRevoked: true };
  }
  private async auditVerificationFailure(
    userId: string | null,
    type: 'EMAIL_VERIFICATION_FAILED' | 'PHONE_VERIFICATION_FAILED',
    context: AuthAuditContext,
    reason: string,
  ) {
    await this.prisma.securityEvent.create({
      data: {
        userId,
        type,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { reason },
      },
    });
  }
  async requestEmailVerification(userId: string) {
    assertDeliveryAvailable();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    assertAccountAvailable(user);
    if (!user) throw new UnauthorizedException('Authentication required');
    if (user.emailVerified) return { accepted: true, alreadyVerified: true };
    const generated = this.generateOpaqueToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
    await this.verificationTokenRepository.consumeAllForUser(
      user.id,
      VerificationTokenType.EMAIL_VERIFICATION,
    );
    await this.verificationTokenRepository.create(
      user.id,
      generated.selector,
      await argon2.hash(generated.secret),
      VerificationTokenType.EMAIL_VERIFICATION,
      expiresAt,
    );
    await deliverChallenge({
      kind: 'email-verification',
      recipient: user.email,
      selector: generated.selector,
      secret: generated.secret,
      expiresAt,
    });
    return process.env.NODE_ENV === 'development'
      ? { accepted: true, developmentVerificationToken: generated.token }
      : { accepted: true };
  }
  async requestPhoneVerification(userId: string) {
    assertDeliveryAvailable();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    assertAccountAvailable(user);
    if (!user) throw new UnauthorizedException('Authentication required');
    if (user.phoneVerified) return { accepted: true, alreadyVerified: true };
    const selector = randomBytes(16).toString('hex');
    const verificationCode = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + PHONE_VERIFICATION_TTL_MS);
    await this.verificationTokenRepository.consumeAllForUser(
      user.id,
      VerificationTokenType.PHONE_VERIFICATION,
    );
    await this.verificationTokenRepository.create(
      user.id,
      selector,
      await argon2.hash(verificationCode),
      VerificationTokenType.PHONE_VERIFICATION,
      expiresAt,
    );
    await deliverChallenge({
      kind: 'phone-verification',
      recipient: user.phone,
      selector,
      secret: verificationCode,
      expiresAt,
    });
    return process.env.NODE_ENV === 'development'
      ? {
          accepted: true,
          selector,
          developmentVerificationSelector: selector,
          developmentVerificationCode: verificationCode,
        }
      : { accepted: true, selector };
  }
  private async confirmVerification(
    selector: string,
    secret: string,
    type: VerificationTokenType,
    context: AuthAuditContext,
  ) {
    const failureType =
      type === VerificationTokenType.EMAIL_VERIFICATION
        ? 'EMAIL_VERIFICATION_FAILED'
        : 'PHONE_VERIFICATION_FAILED';
    const message =
      type === VerificationTokenType.EMAIL_VERIFICATION
        ? 'Invalid email verification token'
        : 'Invalid phone verification code';
    const token =
      await this.verificationTokenRepository.findBySelector(selector);
    if (
      !token ||
      token.type !== type ||
      token.consumedAt ||
      token.expiresAt <= new Date()
    )
      throw new UnauthorizedException(message);
    const reserved = await this.prisma.verificationToken.updateMany({
      where: {
        id: token.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attemptCount: { lt: VERIFICATION_MAX_ATTEMPTS },
      },
      data: { attemptCount: { increment: 1 } },
    });
    if (reserved.count !== 1) {
      await this.auditVerificationFailure(
        token.userId,
        failureType,
        context,
        'ATTEMPT_LIMIT_REACHED',
      );
      throw new UnauthorizedException(message);
    }
    if (!(await argon2.verify(token.tokenHash, secret))) {
      await this.prisma.verificationToken.updateMany({
        where: {
          id: token.id,
          consumedAt: null,
          attemptCount: { gte: VERIFICATION_MAX_ATTEMPTS },
        },
        data: { consumedAt: new Date() },
      });
      await this.auditVerificationFailure(
        token.userId,
        failureType,
        context,
        type === VerificationTokenType.EMAIL_VERIFICATION
          ? 'INVALID_SECRET'
          : 'INVALID_CODE',
      );
      throw new UnauthorizedException(message);
    }
    const claimed = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, token.userId);
      assertAccountAvailable(
        await tx.user.findUnique({ where: { id: token.userId } }),
      );
      const result = await tx.verificationToken.updateMany({
        where: {
          id: token.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (result.count !== 1) return false;
      await tx.user.update({
        where: { id: token.userId },
        data:
          type === VerificationTokenType.EMAIL_VERIFICATION
            ? { emailVerified: true, emailVerifiedAt: new Date() }
            : { phoneVerified: true, phoneVerifiedAt: new Date() },
      });
      await tx.user.updateMany({
        where: {
          id: token.userId,
          status: 'PENDING',
          emailVerified: true,
          phoneVerified: true,
          deletedAt: null,
        },
        data: { status: 'ACTIVE' },
      });
      await tx.securityEvent.create({
        data: {
          userId: token.userId,
          type:
            type === VerificationTokenType.EMAIL_VERIFICATION
              ? 'EMAIL_VERIFIED'
              : 'PHONE_VERIFIED',
        },
      });
      return true;
    });
    if (!claimed) {
      await this.auditVerificationFailure(
        token.userId,
        failureType,
        context,
        'TOKEN_CONSUMED',
      );
      throw new UnauthorizedException(message);
    }
    return { verified: true };
  }
  async confirmEmailVerification(
    data: EmailVerificationConfirmDto,
    context: AuthAuditContext = EMPTY_CONTEXT,
  ) {
    const parsed = this.parseSelectorSecret(data.verificationToken);
    if (!parsed)
      throw new UnauthorizedException('Invalid email verification token');
    return this.confirmVerification(
      parsed.selector,
      parsed.secret,
      VerificationTokenType.EMAIL_VERIFICATION,
      context,
    );
  }
  async confirmPhoneVerification(
    data: PhoneVerificationConfirmDto,
    context: AuthAuditContext = EMPTY_CONTEXT,
  ) {
    return this.confirmVerification(
      data.selector.trim(),
      data.verificationCode.trim(),
      VerificationTokenType.PHONE_VERIFICATION,
      context,
    );
  }
  async logout(userId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await tx.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.securityEvent.create({ data: { userId, type: 'LOGOUT' } });
    });
    return { authenticated: false, loggedOut: true };
  }
}
