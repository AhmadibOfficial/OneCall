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
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import {
  ManagementGuard,
  ManagementPermission,
} from './management.permissions';
import { ReasonDto } from './operations.dto';
import { ManagementService } from './management.service';
import {
  AvailabilityDto,
  CatalogueDto,
  CaseDto,
  ManagementQuery,
  ScheduleDto,
  StaffDto,
} from './management.dto';
type Actor = { user: { id: string } };
@Controller('management')
@UseGuards(JwtAuthGuard, ManagementGuard)
export class ManagementController {
  constructor(private readonly service: ManagementService) {}
  @Header('Cache-Control', 'no-store')
  @Get('session')
  @ManagementPermission('overview')
  session(@Req() r: Actor) {
    return this.service.session(r.user.id);
  }
  @Header('Cache-Control', 'no-store')
  @Get('overview')
  @ManagementPermission('overview')
  overview() {
    return this.service.overview();
  }
  @Header('Cache-Control', 'no-store')
  @Get('customers')
  @ManagementPermission('customers')
  customers(@Query() q: ManagementQuery) {
    return this.service.customers(q);
  }
  @Header('Cache-Control', 'no-store')
  @Get('customers/:id')
  @ManagementPermission('customers')
  customer(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.customer(id);
  }
  @Header('Cache-Control', 'no-store')
  @Get('support')
  @ManagementPermission('support')
  cases(@Query() q: ManagementQuery) {
    return this.service.cases(q);
  }
  @Header('Cache-Control', 'no-store')
  @Post('support/:id')
  @ManagementPermission('support.write')
  updateCase(
    @Req() r: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CaseDto,
  ) {
    return this.service.updateCase(r.user.id, id, d);
  }
  @Header('Cache-Control', 'no-store')
  @Get('staff')
  @ManagementPermission('owner')
  staff() {
    return this.service.staff();
  }
  @Header('Cache-Control', 'no-store')
  @Post('staff')
  @ManagementPermission('owner')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  setStaff(@Req() r: Actor, @Body() d: StaffDto) {
    return this.service.setStaff(r.user.id, d);
  }
  @Header('Cache-Control', 'no-store')
  @Post('bookings/:id/schedule')
  @ManagementPermission('bookings.write')
  schedule(
    @Req() r: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ScheduleDto,
  ) {
    return this.service.schedule(r.user.id, id, d);
  }
  @Post('providers/:id/availability')
  @ManagementPermission('providers.write')
  @Header('Cache-Control', 'no-store')
  availability(
    @Req() r: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: AvailabilityDto,
  ) {
    return this.service.availability(r.user.id, id, d);
  }
  @Post('bookings/:id/photos/:photoId')
  @ManagementPermission('bookings')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async photo(
    @Req() r: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Body() d: ReasonDto,
  ) {
    const photo = await this.service.photo(r.user.id, id, photoId, d.reason);
    return new StreamableFile(photo.bytes, {
      type: photo.mime,
      disposition: 'attachment; filename="booking-photo"',
    });
  }
  @Header('Cache-Control', 'no-store')
  @Get('finance')
  @ManagementPermission('finance')
  finance(@Query() q: ManagementQuery) {
    return this.service.finance(q);
  }
  @Header('Cache-Control', 'no-store')
  @Get('reports')
  @ManagementPermission('reports')
  reports() {
    return this.service.reports();
  }
  @Header('Cache-Control', 'no-store')
  @Get('audit')
  @ManagementPermission('audit')
  audit(@Query() q: ManagementQuery) {
    return this.service.auditLog(q);
  }
  @Header('Cache-Control', 'no-store')
  @Post('catalogue/:key')
  @ManagementPermission('owner')
  setCatalogue(
    @Req() r: Actor,
    @Param('key') key: string,
    @Body() d: CatalogueDto,
  ) {
    return this.service.setCatalogue(r.user.id, key, d);
  }
  @Header('Cache-Control', 'no-store')
  @Get('catalogue')
  @ManagementPermission('catalogue')
  catalogue() {
    return this.service.catalogue();
  }
}
