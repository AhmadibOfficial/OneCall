import {
  Body,
  ConflictException,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

export { AdminGuard } from './admin.guard';
import { AdminGuard } from './admin.guard';
import { AdminOperationsController } from './operations.controller';
import { ManagementController } from './management.controller';
import { ManagementService } from './management.service';
import { ManagementGuard } from './management.permissions';
import { AdminOperationsService } from './operations.service';
class ResponseDto {
  @IsString()
  @Length(1, 2000)
  response!: string;
}
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('overview')
  async overview() {
    const [customers, providers, pendingProviders, bookings, openSupport] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.provider.count({ where: { approved: true } }),
        this.prisma.provider.count({ where: { approved: false } }),
        this.prisma.order.count(),
        this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      ]);
    return {
      accounts: customers,
      approvedProviders: providers,
      pendingProviders,
      bookings,
      openSupport,
    };
  }
  @Get('providers')
  providers() {
    return this.prisma.provider.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        approved: true,
        displayName: true,
        createdAt: true,
        user: {
          select: {
            uid: true,
            email: true,
            emailVerified: true,
            phoneVerified: true,
          },
        },
        coverage: { select: { state: true, cityKey: true, serviceName: true } },
      },
    });
  }
  @Get('bookings')
  bookings() {
    return this.prisma.order.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        serviceName: true,
        state: true,
        city: true,
        status: true,
        createdAt: true,
        customer: { select: { uid: true } },
        provider: { select: { user: { select: { uid: true } } } },
      },
    });
  }
  @Get('support')
  support() {
    return this.prisma.supportTicket.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subject: true,
        message: true,
        status: true,
        response: true,
        createdAt: true,
        user: { select: { uid: true } },
      },
    });
  }
  @Post('support/:id/resolve')
  async resolve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResponseDto,
    @Req() req?: { user: { id: string } },
  ) {
    const response = dto.response.trim();
    if (!response) throw new ConflictException('A response is required');
    await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id } });
      if (!ticket) throw new ConflictException('Ticket is unavailable');
      if (ticket.subject === '[Privacy request] DELETION')
        throw new ConflictException(
          'Use the operator deletion procedure; resolving support does not delete personal data',
        );
      const result = await tx.supportTicket.updateMany({
        where: { id, status: 'OPEN' },
        data: { response, status: 'RESOLVED' },
      });
      if (!result.count)
        throw new ConflictException('Ticket has already been resolved');
      if (req?.user.id)
        await tx.adminOperation.create({
          data: {
            actorId: req.user.id,
            resourceId: id,
            action: 'SUPPORT_RESOLVED',
            reason: 'Legacy support response',
            details: {},
          },
        });
      await tx.notification.create({
        data: {
          userId: ticket.userId,
          title: 'Support response',
          body: 'Operations responded to your support request. Open Support to read it.',
        },
      });
    });
    return { id, resolved: true };
  }
}
@Module({
  imports: [PrismaModule],
  controllers: [
    AdminController,
    AdminOperationsController,
    ManagementController,
  ],
  providers: [
    AdminGuard,
    JwtAuthGuard,
    AdminOperationsService,
    ManagementGuard,
    ManagementService,
  ],
})
export class AdminModule {}
