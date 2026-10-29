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
    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'An active account is required to request a service',
      );
    }
    return true;
  }
}
