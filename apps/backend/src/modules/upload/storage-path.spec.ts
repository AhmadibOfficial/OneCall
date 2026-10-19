import { privateUploadPath } from './storage-path';
const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});
it('keeps the established development photo location', () => {
  process.env.NODE_ENV = 'development';
  delete process.env.ONECALL_UPLOAD_ROOT;
  delete process.env.ONECALL_UPLOADS_ENABLED;
  expect(privateUploadPath('booking-photos')).toBe(
    process.cwd() + '/storage/private/booking-photos',
  );
});
it('uses the configured private persistent mount in production', () => {
  process.env.NODE_ENV = 'production';
  process.env.ONECALL_UPLOAD_ROOT = '/var/lib/onecall/private';
  expect(privateUploadPath('avatars')).toBe('/var/lib/onecall/private/avatars');
});
it('refuses production photos with a relative path or when a preview disables uploads', () => {
  process.env.NODE_ENV = 'production';
  process.env.ONECALL_UPLOAD_ROOT = 'storage/private';
  expect(() => privateUploadPath('booking-photos')).toThrow();
  process.env.ONECALL_UPLOAD_ROOT = '/var/lib/onecall/private';
  process.env.ONECALL_UPLOADS_ENABLED = 'false';
  expect(() => privateUploadPath('avatars')).toThrow();
});
