import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';

export const STAFF_ROLES = {
  ONECALL_OPERATIONS: [
    'overview',
    'providers',
    'bookings',
    'customers',
    'support',
    'catalogue',
    'reports',
    'providers.write',
    'bookings.write',
    'support.write',
  ],
  ONECALL_DISPATCH: ['overview', 'providers', 'bookings', 'bookings.write'],
  ONECALL_SUPPORT: ['overview', 'customers', 'support', 'support.write'],
  ONECALL_FINANCE: ['overview', 'finance', 'reports'],
  ONECALL_AUDITOR: ['overview', 'reports', 'audit'],
} as const;
export function permissionsFor(roles: string[]): string[] {
  if (roles.includes('ADMIN')) return ['*'];
  return [
    ...new Set(
      roles.flatMap(
        (role) => STAFF_ROLES[role as keyof typeof STAFF_ROLES] ?? [],
      ),
    ),
  ];
}
export function allows(roles: string[], permission: string) {
  const permissions = permissionsFor(roles);
  return permissions.includes('*') || permissions.includes(permission);
}
export const ManagementPermission = (permission: string) =>
  SetMetadata('management.permission', permission);
export async function managementActor(
  tx: Prisma.TransactionClient,
  id: string,
  permission: string,
) {
  // Membership writers take an exclusive lock on this same account row.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id}::uuid FOR SHARE`;
  const user = await tx.user.findFirst({
    where: { id, status: 'ACTIVE', deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (
    !user ||
    !allows(
      user.roles.map((r) => r.role.name),
      permission,
    )
  )
    throw new ForbiddenException(
      'Your staff permissions do not allow this operation',
    );
  return user;
}
@Injectable()
export class ManagementGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const id = context.switchToHttp().getRequest<{ user?: { id: string } }>()
      .user?.id;
    if (!id) return false;
    const user = await this.prisma.user.findFirst({
      where: { id, status: 'ACTIVE', deletedAt: null },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    const permission =
      this.reflector.getAllAndOverride<string>('management.permission', [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'owner';
    return (
      !!user &&
      allows(
        user.roles.map((r) => r.role.name),
        permission,
      )
    );
  }
}
