import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';

const userSelect = {
  id: true,
  uid: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  status: true,
  emailVerified: true,
  emailVerifiedAt: true,
  phoneVerified: true,
  phoneVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create User
   */
  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  /**
   * Find by ID (Safe)
   */
  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
  }

  /**
   * Find by Email (Safe)
   */
  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: userSelect,
    });
  }

  /**
   * Find by Phone (Safe)
   */
  findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
      select: userSelect,
    });
  }

  /**
   * Authentication User
   * Returns sensitive fields required during login.
   */
  findAuthUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        uid: true,
        email: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        tokenVersion: true,
        refreshTokenHash: true,
        lastLoginAt: true,
      },
    });
  }

  findAuthUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        uid: true,
        email: true,
        status: true,
        deletedAt: true,
        tokenVersion: true,
        emailVerified: true,
        phoneVerified: true,
      },
    });
  }

  /**
   * Update User
   */
  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Soft Delete
   */
  softDelete(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Hard Delete
   */
  delete(id: string): Promise<User> {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  /**
   * Email Exists
   */
  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { email },
    });

    return count > 0;
  }

  /**
   * Phone Exists
   */
  async existsByPhone(phone: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { phone },
    });

    return count > 0;
  }

  /**
   * Update Last Login
   */
  updateLastLogin(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
      },
    });
  }

  /**
   * Increment Failed Login Attempts
   */
  incrementFailedLogin(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Lock Account
   */
  lockAccount(id: string, lockedUntil: Date): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        lockedUntil,
      },
    });
  }
}
