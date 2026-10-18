import { isAbsolute, resolve } from 'node:path';
import { ServiceUnavailableException } from '@nestjs/common';

export function privateUploadPath(folder: 'avatars' | 'booking-photos') {
  if (process.env.ONECALL_UPLOADS_ENABLED === 'false') {
    throw new ServiceUnavailableException(
      'Photo uploads are unavailable in this preview.',
    );
  }
  const root = process.env.ONECALL_UPLOAD_ROOT;
  if (process.env.NODE_ENV === 'production' && (!root || !isAbsolute(root))) {
    throw new ServiceUnavailableException(
      'Persistent photo storage is not configured.',
    );
  }
  return resolve(root || resolve(process.cwd(), 'storage/private'), folder);
}
