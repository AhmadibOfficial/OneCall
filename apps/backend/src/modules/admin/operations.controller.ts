import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminOperationsService } from './operations.service';
import {
  ApprovalDto,
  AssignmentDto,
  OperationsQuery,
  ReasonDto,
} from './operations.dto';
type Actor = { user: { id: string } };
@Controller('admin/operations')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminOperationsController {
  constructor(private readonly service: AdminOperationsService) {}
  @Get('catalogue') catalogue() {
    return this.service.catalogue();
  }
  @Get('providers') providers(@Query() query: OperationsQuery) {
    return this.service.providers(query);
  }
  @Post('providers/:id/approve') approve(
    @Req() r: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: ApprovalDto,
  ) {
    return this.service.approve(r.user.id, id, d);
  }
  @Post('providers/:id/revoke') revoke(
    @Req() r: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: ReasonDto,
  ) {
    return this.service.revoke(r.user.id, id, d.reason);
  }
  @Get('bookings') bookings(@Query() q: OperationsQuery) {
    return this.service.bookings(q);
  }
  @Get('bookings/:id') detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.detail(id);
  }
  @Post('bookings/:id/assign') assign(
    @Req() r: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: AssignmentDto,
  ) {
    return this.service.assign(r.user.id, id, d);
  }
  @Post('bookings/:id/cancel') cancel(
    @Req() r: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: ReasonDto,
  ) {
    return this.service.cancel(r.user.id, id, d.reason);
  }
}
