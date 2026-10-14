import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/infrastructure/database/prisma';
import { validateImageFile } from './validators/image-file.validator';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { privateUploadPath } from './storage-path';
@Injectable()
export class BookingPhotoService {
  private get root() {
    return privateUploadPath('booking-photos');
  }
  constructor(private readonly prisma: PrismaService) {}
  private async participant(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { provider: true },
    });
    if (
      !order ||
      (order.customerId !== userId && order.provider?.userId !== userId)
    )
      throw new NotFoundException('Booking is unavailable');
    return order;
  }
  async list(userId: string, orderId: string) {
    await this.participant(userId, orderId);
    return this.prisma.bookingPhoto.findMany({
      where: { orderId },
      select: { id: true, mime: true, byteSize: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  async create(userId: string, orderId: string, file: Express.Multer.File) {
    const storageRoot = this.root;
    const format = validateImageFile(file);
    let width = 0,
      height = 0;
    const bytes = file.buffer;
    if (
      format.mime === 'image/png' &&
      bytes.length >= 24 &&
      bytes.toString('ascii', 12, 16) === 'IHDR'
    ) {
      width = bytes.readUInt32BE(16);
      height = bytes.readUInt32BE(20);
    } else if (format.mime === 'image/jpeg') {
      let offset = 2;
      while (offset + 9 <= bytes.length && bytes[offset] === 0xff) {
        if (bytes[offset + 1] === 0xff) {
          offset++;
          continue;
        }
        const marker = bytes[offset + 1];
        if (marker === 0xda || marker === 0xd9) break;
        const length = bytes.readUInt16BE(offset + 2);
        if (length < 2 || offset + 2 + length > bytes.length) break;
        if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 7) {
          height = bytes.readUInt16BE(offset + 5);
          width = bytes.readUInt16BE(offset + 7);
          break;
        }
        offset += 2 + length;
      }
    }
    if (
      !width ||
      !height ||
      width > 4096 ||
      height > 4096 ||
      width * height > 12000000
    )
      throw new BadRequestException(
        'Use a JPEG or PNG photo up to 4096 pixels and 12 megapixels.',
      );
    await this.participant(userId, orderId);
    const key = `${randomUUID()}.${format.extension}`;
    await mkdir(storageRoot, { recursive: true, mode: 0o700 });
    let written = false;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        const current = await tx.user.findUnique({ where: { id: userId } });
        if (
          !current ||
          current.deletedAt ||
          current.status !== 'ACTIVE' ||
          !current.emailVerified ||
          !current.phoneVerified
        )
          throw new ForbiddenException(
            'Verify your account before uploading photos.',
          );
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { provider: true },
        });
        if (
          !order ||
          (order.customerId !== userId && order.provider?.userId !== userId)
        )
          throw new NotFoundException('Booking is unavailable');
        if (['COMPLETED', 'CANCELLED'].includes(order.status))
          throw new ConflictException('This booking is closed');
        if ((await tx.bookingPhoto.count({ where: { orderId } })) >= 6)
          throw new ConflictException('Up to six photos per booking');
        if (
          (await tx.bookingPhoto.count({
            where: {
              uploaderId: userId,
              createdAt: { gt: new Date(Date.now() - 86400000) },
            },
          })) >= 20
        )
          throw new ConflictException('Daily photo upload limit reached');
        await writeFile(resolve(storageRoot, key), file.buffer, {
          flag: 'wx',
          mode: 0o600,
        });
        written = true;
        return tx.bookingPhoto.create({
          data: {
            orderId,
            uploaderId: userId,
            storageKey: key,
            mime: format.mime,
            byteSize: file.buffer.length,
          },
          select: { id: true, mime: true, byteSize: true, createdAt: true },
        });
      });
    } catch (error) {
      if (written)
        await unlink(resolve(storageRoot, key)).catch(() => undefined);
      throw error;
    }
  }
  async bytes(userId: string, orderId: string, photoId: string) {
    await this.participant(userId, orderId);
    const photo = await this.prisma.bookingPhoto.findFirst({
      where: { id: photoId, orderId },
    });
    if (!photo || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(photo.storageKey))
      throw new NotFoundException('Photo is unavailable');
    let bytes: Buffer;
    try {
      bytes = await readFile(resolve(this.root, photo.storageKey));
    } catch {
      throw new NotFoundException('Photo is unavailable');
    }
    return { bytes, mime: photo.mime };
  }
}
