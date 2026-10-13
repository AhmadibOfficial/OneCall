import {
  BadRequestException,
} from '@nestjs/common';

import {
  validateImageFile,
} from '../../modules/upload/validators/image-file.validator';

describe(
  'ONE-UPLOAD — file security',
  () => {
    function file(
      buffer: Buffer,
      mimetype: string,
      size = buffer.length,
    ): Express.Multer.File {
      return {
        fieldname: 'file',
        originalname:
          '../../evil.php',
        encoding: '7bit',
        mimetype,
        size,
        destination: '',
        filename: '',
        path: '',
        buffer,
        stream: null as never,
      };
    }

    it(
      'accepts JPEG by actual file signature',
      () => {
        const buffer =
          Buffer.from([
            0xff,
            0xd8,
            0xff,
            0xe0,
            0x00,
          ]);

        expect(
          validateImageFile(
            file(
              buffer,
              'image/jpeg',
            ),
          ),
        ).toEqual({
          mime: 'image/jpeg',
          extension: 'jpg',
        });
      },
    );

    it(
      'accepts PNG by actual file signature',
      () => {
        const buffer =
          Buffer.from([
            0x89,
            0x50,
            0x4e,
            0x47,
            0x0d,
            0x0a,
            0x1a,
            0x0a,
          ]);

        expect(
          validateImageFile(
            file(
              buffer,
              'image/png',
            ),
          ),
        ).toEqual({
          mime: 'image/png',
          extension: 'png',
        });
      },
    );

    it(
      'accepts WebP by actual file signature',
      () => {
        const buffer =
          Buffer.from(
            '524946460000000057454250',
            'hex',
          );

        expect(
          validateImageFile(
            file(
              buffer,
              'image/webp',
            ),
          ),
        ).toEqual({
          mime: 'image/webp',
          extension: 'webp',
        });
      },
    );

    it(
      'rejects forged MIME type',
      () => {
        const buffer =
          Buffer.from(
            '<?php echo "evil"; ?>',
          );

        expect(() =>
          validateImageFile(
            file(
              buffer,
              'image/jpeg',
            ),
          ),
        ).toThrow(
          BadRequestException,
        );
      },
    );

    it(
      'rejects unsupported content',
      () => {
        const buffer =
          Buffer.from(
            'plain text',
          );

        expect(() =>
          validateImageFile(
            file(
              buffer,
              'text/plain',
            ),
          ),
        ).toThrow(
          BadRequestException,
        );
      },
    );

    it(
      'rejects oversized files',
      () => {
        const buffer =
          Buffer.alloc(
            1024,
          );

        expect(() =>
          validateImageFile(
            file(
              buffer,
              'image/jpeg',
              5 * 1024 * 1024 + 1,
            ),
          ),
        ).toThrow(
          BadRequestException,
        );
      },
    );

    it(
      'rejects zero-byte uploads',
      () => {
        expect(() =>
          validateImageFile(
            file(
              Buffer.alloc(0),
              'image/jpeg',
              0,
            ),
          ),
        ).toThrow(
          BadRequestException,
        );
      },
    );

    it(
      'rejects missing files',
      () => {
        expect(() =>
          validateImageFile(
            undefined as never,
          ),
        ).toThrow(
          BadRequestException,
        );
      },
    );
  },
);
