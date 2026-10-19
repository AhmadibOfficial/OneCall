import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { Throttle, minutes } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import { PrismaService } from '@/infrastructure/database/prisma';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
class ProofDto {
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}
class PrivacyRequestDto {
  @IsIn(['ACCESS', 'CORRECTION', 'DELETION']) kind!: string;
  @IsString() @MinLength(5) @MaxLength(2000) message!: string;
}
const prefix = '[Privacy request] ';
@Controller('account/privacy')
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('requests')
  @Header('Cache-Control', 'no-store')
  requests(@Req() req: { user: { id: string } }) {
    return this.prisma.supportTicket.findMany({
      where: { userId: req.user.id, subject: { startsWith: prefix } },
      select: {
        id: true,
        subject: true,
        message: true,
        status: true,
        response: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Post('requests')
  @Throttle({ default: { limit: 3, ttl: minutes(15) } })
  async create(
    @Req() req: { user: { id: string } },
    @Body() dto: PrivacyRequestDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${req.user.id}::uuid FOR UPDATE`;
      const subject = prefix + dto.kind;
      if (
        await tx.supportTicket.count({
          where: { userId: req.user.id, subject, status: 'OPEN' },
        })
      )
        throw new ConflictException(
          'You already have an open request of this type.',
        );
      return tx.supportTicket.create({
        data: { userId: req.user.id, subject, message: dto.message.trim() },
        select: { id: true, subject: true, status: true, createdAt: true },
      });
    });
  }
  @Post('snapshot')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 3, ttl: minutes(15) } })
  async snapshot(@Req() req: { user: { id: string } }, @Body() dto: ProofDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: req.user.id },
    });
    if (!(await argon2.verify(user.passwordHash, dto.password)))
      throw new ForbiddenException(
        'Confirm your OneCall password. Set one through verified password recovery first if needed.',
      );
    const id = user.id;
    const counts = await Promise.all([
      this.prisma.order.count({ where: { customerId: id } }),
      this.prisma.orderMessage.count({ where: { senderId: id } }),
    ]);
    if (counts[0] > 1000 || counts[1] > 5000)
      throw new ConflictException(
        'Request a full data export through Privacy requests. Your records exceed the immediate snapshot limit.',
      );
    const [addresses, bookings, messages, support, identities, photos] =
      await Promise.all([
        this.prisma.address.findMany({ where: { userId: id } }),
        this.prisma.order.findMany({
          where: { customerId: id },
          select: {
            id: true,
            serviceName: true,
            state: true,
            city: true,
            address: true,
            description: true,
            status: true,
            createdAt: true,
            scheduledAt: true,
          },
        }),
        this.prisma.orderMessage.findMany({
          where: { senderId: id },
          select: { orderId: true, text: true, createdAt: true },
        }),
        this.prisma.supportTicket.findMany({
          where: { userId: id },
          select: {
            id: true,
            subject: true,
            message: true,
            status: true,
            response: true,
            createdAt: true,
          },
        }),
        this.prisma.socialIdentity.findMany({
          where: { userId: id },
          select: { provider: true, subject: true, createdAt: true },
        }),
        this.prisma.bookingPhoto.findMany({
          where: { uploaderId: id },
          select: {
            id: true,
            orderId: true,
            mime: true,
            byteSize: true,
            createdAt: true,
          },
        }),
      ]);
    return {
      generatedAt: new Date(),
      scope:
        'Basic account records. Request retained audit/other records through Support; this is not a complete statutory access response.',
      profile: {
        uid: user.uid,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        createdAt: user.createdAt,
      },
      addresses,
      bookings,
      messages,
      support,
      identities,
      photos,
    };
  }
}
