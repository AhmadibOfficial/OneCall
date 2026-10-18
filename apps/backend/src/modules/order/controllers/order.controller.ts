import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { VerifiedAccountGuard } from '@/modules/auth/guards/verified-account.guard';

import { CreateOrderDto } from '../dto/create-order.dto';
import { OrderService } from '../services/order.service';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    uid: string;
    email: string;
  };
};

@Controller('orders')
@UseGuards(JwtAuthGuard, VerifiedAccountGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  private getUserId(request: AuthenticatedRequest): string {
    if (!request.user?.id) {
      throw new UnauthorizedException('Authentication required');
    }

    return request.user.id;
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() data: CreateOrderDto,
  ) {
    return this.orderService.create(this.getUserId(request), data);
  }

  @Get()
  async findMany(@Req() request: AuthenticatedRequest) {
    return this.orderService.findManyForUser(this.getUserId(request));
  }

  @Get('available')
  async findAvailable(@Req() request: AuthenticatedRequest) {
    return this.orderService.findAvailable(this.getUserId(request));
  }

  @Get(':id')
  async findById(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orderService.findById(this.getUserId(request), id);
  }

  @Post(':id/accept')
  async accept(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orderService.accept(this.getUserId(request), id);
  }

  @Post(':id/start')
  async start(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orderService.start(this.getUserId(request), id);
  }

  @Post(':id/complete')
  async complete(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orderService.complete(this.getUserId(request), id);
  }

  @Post(':id/cancel')
  async cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orderService.cancel(this.getUserId(request), id);
  }
}
