import { UnauthorizedException } from '@nestjs/common';
export type AuthAccount = { status: string; deletedAt?: Date | null };
export function assertAccountAvailable(
  user: AuthAccount | null | undefined,
): void {
  if (!user || user.deletedAt || !['PENDING', 'ACTIVE'].includes(user.status)) {
    throw new UnauthorizedException('Account is not available');
  }
}
