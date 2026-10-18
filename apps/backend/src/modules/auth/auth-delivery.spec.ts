import { ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { assertDeliveryAvailable, deliverChallenge } from './auth-delivery';

describe('Authentication challenge delivery', () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH_DELIVERY_URL: process.env.AUTH_DELIVERY_URL,
    AUTH_DELIVERY_SECRET: process.env.AUTH_DELIVERY_SECRET,
  };
  const challenge = {
    kind: 'phone-verification' as const,
    recipient: '+2348012345678',
    selector: 'test-selector',
    secret: '654321',
    expiresAt: new Date('2026-10-09T23:00:00Z'),
  };
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_DELIVERY_URL;
    delete process.env.AUTH_DELIVERY_SECRET;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  test.each([
    undefined,
    'invalid-url',
    'http://delivery.example.com',
    'https://user:secret@delivery.example.com',
  ])('unavailable delivery %s fails consistently', (url) => {
    if (url !== undefined) process.env.AUTH_DELIVERY_URL = url;
    process.env.AUTH_DELIVERY_SECRET = 'onecall-disposable-delivery-secret';
    expect(() => assertDeliveryAvailable()).toThrow(
      ServiceUnavailableException,
    );
  });
  test('development never sends a real message', async () => {
    process.env.NODE_ENV = 'development';
    const send = jest.spyOn(globalThis, 'fetch');
    await deliverChallenge(challenge);
    expect(send).not.toHaveBeenCalled();
  });
  test('signs the exact payload sent to the HTTPS delivery adapter', async () => {
    const timestamp = 1791580000;
    const key = 'onecall-disposable-delivery-secret';
    process.env.AUTH_DELIVERY_URL = 'https://delivery.example.com/challenges';
    process.env.AUTH_DELIVERY_SECRET = key;
    jest.spyOn(Date, 'now').mockReturnValue(timestamp * 1000);
    const send = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const body = JSON.stringify(challenge);
    const digest = createHmac('sha256', key)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    await deliverChallenge(challenge);
    expect(send).toHaveBeenCalledWith(
      'https://delivery.example.com/challenges',
      expect.objectContaining({
        method: 'POST',
        body,
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'x-onecall-signature': `t=${timestamp},v1=${digest}`,
        },
      }),
    );
  });
  test('a rejected delivery fails without exposing the code', async () => {
    process.env.AUTH_DELIVERY_URL = 'https://delivery.example.com/challenges';
    process.env.AUTH_DELIVERY_SECRET = 'onecall-disposable-delivery-secret';
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 503 }));
    await expect(deliverChallenge(challenge)).rejects.toThrow(
      'Verification delivery is temporarily unavailable',
    );
  });
});
