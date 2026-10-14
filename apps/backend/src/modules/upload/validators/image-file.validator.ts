import { BadRequestException } from '@nestjs/common';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type SupportedImage = {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
};

function detectImage(buffer: Buffer): SupportedImage | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return {
      mime: 'image/jpeg',
      extension: 'jpg',
    };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ]),
    )
  ) {
    return {
      mime: 'image/png',
      extension: 'png',
    };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return {
      mime: 'image/webp',
      extension: 'webp',
    };
  }

  return null;
}

export function validateImageFile(
  file: Express.Multer.File,
): SupportedImage {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException('Invalid uploaded file');
  }

  if (file.size <= 0) {
    throw new BadRequestException('Uploaded file is empty');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new BadRequestException('Uploaded file is too large');
  }

  const detected = detectImage(file.buffer);

  if (!detected) {
    throw new BadRequestException(
      'Uploaded file content is not a supported image',
    );
  }

  /*
   * Some multipart clients omit the MIME type and send
   * application/octet-stream. In that case content detection
   * remains authoritative.
   *
   * When a real image MIME is supplied, it must match the bytes.
   */
  if (
    file.mimetype !== 'application/octet-stream' &&
    file.mimetype !== detected.mime
  ) {
    throw new BadRequestException(
      'Uploaded file MIME type does not match its content',
    );
  }

  return detected;
}