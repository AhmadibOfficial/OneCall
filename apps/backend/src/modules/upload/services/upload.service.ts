import { privateUploadPath } from '../storage-path';
import { BadRequestException, Injectable } from '@nestjs/common';

import { createHash, randomUUID } from 'node:crypto';

import { mkdir, unlink, writeFile } from 'node:fs/promises';

import { join, resolve } from 'node:path';

import { UploadPurpose } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service';

import { validateImageFile } from '../validators/image-file.validator';

@Injectable()
export class UploadService {
  private get storageRoot() {
    return privateUploadPath('avatars');
  }

  constructor(private readonly prisma: PrismaService) {}

  async uploadAvatar(ownerId: string, file: Express.Multer.File) {
    const validated = validateImageFile(file);

    await mkdir(this.storageRoot, {
      recursive: true,
      mode: 0o700,
    });

    const storageKey = `${randomUUID()}.${validated.extension}`;

    const filePath = join(this.storageRoot, storageKey);

    const resolvedPath = resolve(filePath);

    if (!resolvedPath.startsWith(`${this.storageRoot}/`)) {
      throw new BadRequestException('Invalid storage path');
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    await writeFile(resolvedPath, file.buffer, { flag: 'wx', mode: 0o600 });

    try {
      const upload = await this.prisma.storedUpload.create({
        data: {
          ownerId,
          purpose: UploadPurpose.AVATAR,
          storageKey,
          detectedMime: validated.mime,
          byteSize: file.size,
          sha256,
        },
        select: {
          id: true,
          detectedMime: true,
          byteSize: true,
          sha256: true,
          createdAt: true,
        },
      });

      return upload;
    } catch (error) {
      await unlink(resolvedPath).catch(() => undefined);

      throw error;
    }
  }
}
