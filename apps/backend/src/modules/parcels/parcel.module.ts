import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Module,
  NestInterceptor,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedAccountGuard } from '../auth/guards/verified-account.guard';
import { AdminGuard } from '../admin/admin.guard';
import { ParcelService } from './parcel.service';
import {
  ParcelAgentDto,
  ParcelCodeDto,
  ParcelCreateDto,
  ParcelListQuery,
  ParcelMoveDto,
  ParcelReasonDto,
  ParcelReviewDto,
  ParcelRouteDto,
  ParcelRouteReviewDto,
} from './parcel.dto';
type Actor = { user: { id: string } };
@Injectable()
class ParcelNoStore implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}

@Controller('parcels')
@UseGuards(JwtAuthGuard, VerifiedAccountGuard)
@UseInterceptors(ParcelNoStore)
class ParcelController {
  constructor(private readonly parcels: ParcelService) {}
  @Get('shops') shops(@Query() query: ParcelListQuery) {
    return this.parcels.shops(query);
  }
  @Get('routes') routes(@Query() query: ParcelListQuery) {
    return this.parcels.routes(query);
  }
  @Get('agent') agent(@Req() req: Actor) {
    return this.parcels.myAgent(req.user.id);
  }
  @Post('agent/apply') apply(@Req() req: Actor, @Body() body: ParcelAgentDto) {
    return this.parcels.apply(req.user.id, body);
  }
  @Post('agent/routes') propose(
    @Req() req: Actor,
    @Body() body: ParcelRouteDto,
  ) {
    return this.parcels.propose(req.user.id, body);
  }
  @Get('agent/jobs') jobs(@Req() req: Actor, @Query() query: ParcelListQuery) {
    return this.parcels.list(req.user.id, query, true);
  }
  @Get() list(@Req() req: Actor, @Query() query: ParcelListQuery) {
    return this.parcels.list(req.user.id, query);
  }
  @Post() create(@Req() req: Actor, @Body() body: ParcelCreateDto) {
    return this.parcels.create(req.user.id, body);
  }
  @Get(':id') detail(
    @Req() req: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.parcels.detail(req.user.id, id);
  }
  @Post(':id/move') move(
    @Req() req: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ParcelMoveDto,
  ) {
    return this.parcels.advance(req.user.id, id, body);
  }
  @Post(':id/cancel') cancel(
    @Req() req: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ParcelReasonDto,
  ) {
    return this.parcels.cancelOrReturn(req.user.id, id, body.reason, false);
  }
  @Post(':id/return') returning(
    @Req() req: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ParcelReasonDto,
  ) {
    return this.parcels.cancelOrReturn(req.user.id, id, body.reason, true);
  }
  @Post(':id/collection-code')
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  code(@Req() req: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.parcels.issueCode(req.user.id, id);
  }
  @Post(':id/collect')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  collect(
    @Req() req: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ParcelCodeDto,
  ) {
    return this.parcels.collect(req.user.id, id, body.code);
  }
  @Post(':id/support') support(
    @Req() req: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ParcelReasonDto,
  ) {
    return this.parcels.support(req.user.id, id, body.reason);
  }
}

@Controller('admin/parcels')
@UseGuards(JwtAuthGuard, VerifiedAccountGuard, AdminGuard)
@UseInterceptors(ParcelNoStore)
class ParcelAdminController {
  constructor(private readonly parcels: ParcelService) {}
  @Get() list(@Req() req: Actor) {
    return this.parcels.adminList(req.user.id);
  }
  @Post('agents/:id/review') agent(
    @Req() req: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ParcelReviewDto,
  ) {
    return this.parcels.reviewAgent(req.user.id, id, body);
  }
  @Post('routes/:id/review') route(
    @Req() req: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ParcelRouteReviewDto,
  ) {
    return this.parcels.reviewRoute(req.user.id, id, body);
  }
  @Post('shipments/:id/view') detail(
    @Req() req: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ParcelReasonDto,
  ) {
    return this.parcels.adminDetail(req.user.id, id, body.reason);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [ParcelController, ParcelAdminController],
  providers: [ParcelService, AdminGuard],
})
export class ParcelModule {}
