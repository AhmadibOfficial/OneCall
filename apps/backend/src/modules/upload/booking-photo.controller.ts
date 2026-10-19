import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, minutes } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { VerifiedAccountGuard } from '@/modules/auth/guards/verified-account.guard';
import { BookingPhotoService } from './booking-photo.service';
@Controller('orders/:id/photos')
@UseGuards(JwtAuthGuard)
export class BookingPhotoController {
  constructor(private readonly photos: BookingPhotoService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Req() req: { user: { id: string } },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.photos.list(req.user.id, id);
  }
  @Post()
  @UseGuards(VerifiedAccountGuard)
  @Throttle({ default: { limit: 10, ttl: minutes(5) } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    }),
  )
  create(
    @Req() req: { user: { id: string } },
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.photos.create(req.user.id, id, file);
  }
  @Get(':photoId')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  async bytes(
    @Req() req: { user: { id: string } },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
  ) {
    const photo = await this.photos.bytes(req.user.id, id, photoId);
    return new StreamableFile(photo.bytes, {
      type: photo.mime,
      disposition: 'attachment; filename="booking-photo"',
    });
  }
}
