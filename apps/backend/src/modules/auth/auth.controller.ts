import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, minutes } from '@nestjs/throttler';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { EmailVerificationConfirmDto } from './dto/email-verification-confirm.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PhoneVerificationConfirmDto } from './dto/phone-verification-confirm.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    uid: string;
    email: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: minutes(15) } })
  async register(@Body() data: RegisterDto) {
    return this.authService.register(data);
  }

  @Throttle({ default: { limit: 5, ttl: minutes(15) } })
  @Post('login')
  async login(@Body() data: LoginDto) {
    return this.authService.login(data);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: minutes(5) } })
  async refresh(@Body() data: RefreshDto) {
    return this.authService.refresh(data.refreshToken);
  }

  @Throttle({ default: { limit: 3, ttl: minutes(15) } })
  @Post('password-reset/request')
  async requestPasswordReset(@Body() data: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(data);
  }

  @Post('password-reset/confirm')
  @Throttle({ default: { limit: 10, ttl: minutes(15) } })
  async confirmPasswordReset(@Body() data: PasswordResetConfirmDto) {
    return this.authService.confirmPasswordReset(data);
  }

  @Post('email-verification/request')
  @Throttle({ default: { limit: 3, ttl: minutes(15) } })
  @UseGuards(JwtAuthGuard)
  async requestEmailVerification(@Req() request: AuthenticatedRequest) {
    if (!request.user?.id) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.authService.requestEmailVerification(request.user.id);
  }

  @Post('email-verification/confirm')
  @Throttle({ default: { limit: 10, ttl: minutes(15) } })
  async confirmEmailVerification(
    @Body() data: EmailVerificationConfirmDto,
    @Req() request: Request,
  ) {
    return this.authService.confirmEmailVerification(data, {
      ipAddress: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Throttle({ default: { limit: 3, ttl: minutes(15) } })
  @Post('phone-verification/request')
  @UseGuards(JwtAuthGuard)
  async requestPhoneVerification(@Req() request: AuthenticatedRequest) {
    if (!request.user?.id) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.authService.requestPhoneVerification(request.user.id);
  }

  @Post('phone-verification/confirm')
  @Throttle({ default: { limit: 10, ttl: minutes(15) } })
  async confirmPhoneVerification(
    @Body() data: PhoneVerificationConfirmDto,
    @Req() request: Request,
  ) {
    return this.authService.confirmPhoneVerification(data, {
      ipAddress: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() request: AuthenticatedRequest) {
    if (!request.user?.id) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.authService.logout(request.user.id);
  }
}
