import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import {
  AuthGuard,
} from '@nestjs/passport';

import {
  FileInterceptor,
} from '@nestjs/platform-express';

import {
  memoryStorage,
} from 'multer';

import type {
  Request,
} from 'express';

import {
  UploadService,
} from '../services/upload.service';

@Controller('uploads')
@UseGuards(
  AuthGuard('jwt'),
)
export class UploadController {
  constructor(
    private readonly uploadService:
      UploadService,
  ) {}

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor(
      'file',
      {
        storage:
          memoryStorage(),

        limits: {
          fileSize:
            5 * 1024 * 1024,
          files: 1,
          fields: 2,
          parts: 3,
          fieldNameSize: 100,
          fieldSize: 1024,
        },

        fileFilter: (
          _request,
          file,
          callback,
        ) => {
          const allowed =
            new Set([
              'image/jpeg',
              'image/png',
              'image/webp',
              'application/octet-stream',
            ]);

          if (
            !allowed.has(
              file.mimetype,
            )
          ) {
            callback(
              new BadRequestException(
                'Unsupported file type',
              ),
              false,
            );

            return;
          }

          callback(
            null,
            true,
          );
        },
      },
    ),
  )
  async uploadAvatar(
    @Req() request: Request,
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    const user =
      request.user as {
        id?: string;
      };

    if (!user?.id) {
      throw new BadRequestException(
        'Authenticated user identity missing',
      );
    }

    return this.uploadService.uploadAvatar(
      user.id,
      file,
    );
  }
}
