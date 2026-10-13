import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { VerifiedAccountGuard } from '@/modules/auth/guards/verified-account.guard';
import { MarketplaceService } from './marketplace.service';
import {
  AddressDto,
  FavoriteDto,
  LocationDto,
  MessageDto,
  ProfileDto,
  ProviderApplicationDto,
  QuoteAcceptanceDto,
  QuoteDto,
  SupportDto,
} from './marketplace.dto';

type AuthRequest = Request & { user: { id: string } };

@Controller()
@UseGuards(JwtAuthGuard)
export class AccountFeaturesController {
  constructor(private readonly service: MarketplaceService) {}
  @Get('support') tickets(@Req() r: AuthRequest) {
    return this.service.tickets(r.user.id);
  }
  @Post('support') support(@Req() r: AuthRequest, @Body() d: SupportDto) {
    return this.service.support(r.user.id, d);
  }
  @Get('favorites') favorites(@Req() r: AuthRequest) {
    return this.service.favorites(r.user.id);
  }
  @Put('favorites') favorite(@Req() r: AuthRequest, @Body() d: FavoriteDto) {
    return this.service.favorite(r.user.id, d.serviceName, true);
  }
  @Delete('favorites') unfavorite(
    @Req() r: AuthRequest,
    @Body() d: FavoriteDto,
  ) {
    return this.service.favorite(r.user.id, d.serviceName, false);
  }
  @Get('notifications') notifications(@Req() r: AuthRequest) {
    return this.service.notifications(r.user.id);
  }
  @Post('notifications/read-all') readAll(@Req() r: AuthRequest) {
    return this.service.readNotification(r.user.id);
  }
  @Post('notifications/:id/read') read(
    @Req() r: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.readNotification(r.user.id, id);
  }
  @Get('addresses') addresses(@Req() r: AuthRequest) {
    return this.service.addresses(r.user.id);
  }
  @Post('addresses') saveAddress(@Req() r: AuthRequest, @Body() d: AddressDto) {
    return this.service.saveAddress(r.user.id, d);
  }
  @Put('addresses/:id') updateAddress(
    @Req() r: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: AddressDto,
  ) {
    return this.service.saveAddress(r.user.id, d, id);
  }
  @Delete('addresses/:id') deleteAddress(
    @Req() r: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.deleteAddress(r.user.id, id);
  }
  @Patch('profile') profile(@Req() r: AuthRequest, @Body() d: ProfileDto) {
    return this.service.profile(r.user.id, d);
  }
  @Get('provider/me') provider(@Req() r: AuthRequest) {
    return this.service.provider(r.user.id);
  }
}

@Controller()
@UseGuards(JwtAuthGuard, VerifiedAccountGuard)
export class BookingFeaturesController {
  constructor(private readonly service: MarketplaceService) {}
  @Post('provider/apply') apply(
    @Req() r: AuthRequest,
    @Body() d: ProviderApplicationDto,
  ) {
    return this.service.apply(r.user.id, d);
  }
  @Post('orders/:id/quote') quote(
    @Req() r: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: QuoteDto,
  ) {
    return this.service.quote(r.user.id, id, d.amount);
  }
  @Post('orders/:id/quote/accept') accept(
    @Req() r: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: QuoteAcceptanceDto,
  ) {
    return this.service.acceptQuote(r.user.id, id, d.quoteId);
  }
  @Get('orders/:id/tracking') tracking(
    @Req() r: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.tracking(r.user.id, id);
  }
  @Post('orders/:id/location') location(
    @Req() r: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: LocationDto,
  ) {
    return this.service.shareLocation(r.user.id, id, d);
  }
  @Get('orders/:id/messages') messages(
    @Req() r: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.messages(r.user.id, id);
  }
  @Post('orders/:id/messages') send(
    @Req() r: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: MessageDto,
  ) {
    return this.service.sendMessage(r.user.id, id, d.text);
  }
  @Get('orders/:id/customer-contact') contact(
    @Req() r: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.customerContact(r.user.id, id);
  }
}
