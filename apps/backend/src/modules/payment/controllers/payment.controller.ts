import {
  Body,
  Controller,
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

import { CreatePaymentDto } from '../dto/create-payment.dto';
import { PaymentService } from '../services/payment.service';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    uid: string;
    email: string;
  };
};

@Controller('orders')
@UseGuards(JwtAuthGuard, VerifiedAccountGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post(':id/payments')
  async initialize(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @Body() data: CreatePaymentDto,
  ) {
    if (!request.user?.id) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.paymentService.initialize(request.user.id, orderId, data);
  }
}
