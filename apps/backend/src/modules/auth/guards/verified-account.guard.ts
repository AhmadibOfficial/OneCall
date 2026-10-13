import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
@Injectable()
export class VerifiedAccountGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{
      user?: { status: string; emailVerified: boolean; phoneVerified: boolean };
    }>().user;
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !user.emailVerified ||
      !user.phoneVerified
    ) {
      throw new ForbiddenException(
        'Verify your email and phone before requesting a service',
      );
    }
    return true;
  }
}
