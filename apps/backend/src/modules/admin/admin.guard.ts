import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const user = context
      .switchToHttp()
      .getRequest<{ user?: { id: string } }>().user;
    if (!user) return false;
    return !!(await this.prisma.userRole.findFirst({
      where: { userId: user.id, role: { name: 'ADMIN' } },
      select: { userId: true },
    }));
  }
}
