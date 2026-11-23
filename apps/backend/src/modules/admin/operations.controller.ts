import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import {
  ManagementGuard,
  ManagementPermission,
} from './management.permissions';
import { AdminOperationsService } from './operations.service';
import {
  ApprovalDto,
  AssignmentDto,
  OperationsQuery,
  ReasonDto,
} from './operations.dto';
type Actor = { user: { id: string } };
@Controller('admin/operations')
@UseGuards(JwtAuthGuard, ManagementGuard)
export class AdminOperationsController {
  constructor(private readonly service: AdminOperationsService) {}
  @Header('Cache-Control', 'no-store')
  @Get('catalogue')
  @ManagementPermission('providers')
  catalogue() {
    return this.service.catalogue();
  }
  @Header('Cache-Control', 'no-store')
  @Get('providers')
  @ManagementPermission('providers')
  providers(@Query() query: OperationsQuery) {
    return this.service.providers(query);
  }
  @Post('providers/:id/approve')
  @ManagementPermission('providers.write')
  approve(
    @Req() r: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: ApprovalDto,
  ) {
    return this.service.approve(r.user.id, id, d);
  }
  @Post('providers/:id/revoke') @ManagementPermission('providers.write') revoke(
    @Req() r: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: ReasonDto,
  ) {
    return this.service.revoke(r.user.id, id, d.reason);
  }
  @Header('Cache-Control', 'no-store')
  @Get('bookings')
  @ManagementPermission('bookings')
  bookings(@Query() q: OperationsQuery) {
    return this.service.bookings(q);
  }
  @Header('Cache-Control', 'no-store')
  @Get('bookings/:id')
  @ManagementPermission('bookings')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.detail(id);
  }
  @Post('bookings/:id/assign') @ManagementPermission('bookings.write') assign(
    @Req() r: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: AssignmentDto,
  ) {
    return this.service.assign(r.user.id, id, d);
  }
  @Post('bookings/:id/cancel') @ManagementPermission('bookings.write') cancel(
    @Req() r: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: ReasonDto,
  ) {
    return this.service.cancel(r.user.id, id, d.reason);
  }
}
