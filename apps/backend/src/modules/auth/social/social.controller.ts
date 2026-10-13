import { AdminGuard } from '@/modules/admin/admin.guard';
import { AppleLifecycleService } from './apple-lifecycle.service';
import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, minutes } from '@nestjs/throttler';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { SocialBrowserService } from './social-browser.service';
import { SocialService } from './social.service';
import {
  SocialChallengeDto,
  SocialExchangeDto,
  SocialCompleteDto,
  SocialUnlinkDto,
  SocialResultDto,
  AppleNotificationDto,
} from './social.dto';
@Controller('auth/social')
@Throttle({ default: { limit: 10, ttl: minutes(5) } })
export class SocialController {
  constructor(
    private readonly social: SocialService,
    private readonly browser: SocialBrowserService,
    private readonly appleLifecycle: AppleLifecycleService,
  ) {}
  @Get('configuration')
  @Header('Cache-Control', 'no-store')
  configuration() {
    return {
      ...this.social.configuration(),
      googleBrowser: this.browser.enabled('google'),
      appleBrowser: this.browser.enabled('apple'),
    };
  }
  @Get('linked')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  linked(@Req() request: { user: { id: string } }) {
    return this.social.linked(request.user.id);
  }
  @Post('unlink')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 3, ttl: minutes(15) } })
  @UseGuards(JwtAuthGuard)
  unlink(
    @Req() request: { user: { id: string } },
    @Body() data: SocialUnlinkDto,
  ) {
    return this.social.unlink(request.user.id, data);
  }
  @Post('apple/notifications')
  @Throttle({ default: { limit: 500, ttl: minutes(1) } })
  @Header('Cache-Control', 'no-store')
  notifications(@Body() data: AppleNotificationDto) {
    return this.appleLifecycle.notify(data.payload);
  }
  @Post('apple/check-due')
  @UseGuards(JwtAuthGuard, AdminGuard)
  checkDue() {
    return this.appleLifecycle.checkDue();
  }
  @Post('challenge')
  @Header('Cache-Control', 'no-store')
  challenge(@Body() data: SocialChallengeDto) {
    return data.browser
      ? this.browser.begin(data.provider)
      : this.social.begin(data.provider);
  }
  @Post('browser/link-challenge')
  @UseGuards(JwtAuthGuard)
  linkChallenge(
    @Req() req: { user: { id: string; tokenVersion: number } },
    @Body() data: SocialChallengeDto,
  ) {
    return this.browser.begin(data.provider, req.user);
  }
  @Throttle({ default: { limit: 180, ttl: minutes(5) } })
  @Post('browser/result')
  @Header('Cache-Control', 'no-store')
  result(@Body() data: SocialResultDto) {
    return this.browser.result(data.challenge);
  }
  @Get('callback/google')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  googleCallback(
    @Query('state') state: unknown,
    @Query('code') code: unknown,
    @Query('error') error: unknown,
  ) {
    return this.browser.callback('google', state, code, error);
  }
  @Post('callback/apple')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  appleCallback(@Req() req: { body: Record<string, unknown> }) {
    return this.browser.callback(
      'apple',
      req.body.state,
      req.body.code,
      req.body.error,
    );
  }
  @Post('exchange')
  @Header('Cache-Control', 'no-store')
  exchange(@Body() data: SocialExchangeDto) {
    return this.social.exchange(data);
  }
  @Post('complete')
  @Header('Cache-Control', 'no-store')
  complete(@Body() data: SocialCompleteDto) {
    return this.social.complete(data);
  }
  @Post('link')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  link(
    @Req() request: { user: { id: string } },
    @Body() data: SocialExchangeDto,
  ) {
    return this.social.link(request.user.id, data);
  }
}
