import { Module } from '@nestjs/common';
import { UploadController } from './controllers/upload.controller';
import { UploadService } from './services/upload.service';
import { BookingPhotoService } from './booking-photo.service';
import { BookingPhotoController } from './booking-photo.controller';
@Module({
  controllers: [UploadController, BookingPhotoController],
  providers: [UploadService, BookingPhotoService],
})
export class UploadModule {}
