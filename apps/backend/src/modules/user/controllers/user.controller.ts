import { Controller, Get, UseGuards } from '@nestjs/common';

import {
  CurrentUser,
  type CurrentUser as CurrentUserType,
} from '@/modules/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { UserService } from '../services/user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: CurrentUserType) {
    return {
      authenticated: true,
      user: await this.userService.findById(user.id),
    };
  }
}
