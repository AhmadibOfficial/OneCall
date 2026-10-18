import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PaystackGateway } from './paystack.gateway';

describe('Paystack server contract', () => {
  const key = 'sk_test_disposable';
  const gateway = new PaystackGateway(
    new ConfigService({
      PAYSTACK_SECRET_KEY: key,
      ONECALL_WALLET_ENABLED: 'false',
    }),
  );
  afterEach(() => jest.restoreAllMocks());
  test('wallet funding requires an explicit setting', () => {
    expect(gateway.enabled).toBe(true);
    expect(gateway.walletEnabled).toBe(false);
  });
  test('exact request bytes authenticate a webhook', () => {
    const raw = Buffer.from('{"event":"charge.success"}');
    const signature = createHmac('sha512', key).update(raw).digest('hex');
    expect(() => gateway.verifySignature(raw, signature)).not.toThrow();
    expect(() =>
      gateway.verifySignature(
        Buffer.from('{ "event":"charge.success"}'),
        signature,
      ),
    ).toThrow('Invalid payment signature');
    expect(() => gateway.verifySignature(raw, 'abc')).toThrow(
      'Invalid payment signature',
    );
  });
  test('checkout cannot redirect to a foreign host or include credentials', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch');
    for (const url of [
      'https://foreign.example/charge',
      'http://checkout.paystack.com/charge',
      'https://user:password@checkout.paystack.com/charge',
    ]) {
      fetcher.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: true,
            data: { reference: 'onecall-test', authorization_url: url },
          }),
        ),
      );
      await expect(
        gateway.initialize('onecall-test', 12345n, 'customer@example.com'),
      ).rejects.toThrow('Invalid checkout address');
    }
  });
  test('the initialization request uses server kobo and disables redirects', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: {
            reference: 'onecall-test',
            authorization_url: 'https://checkout.paystack.com/valid',
          },
        }),
      ),
    );
    await expect(
      gateway.initialize('onecall-test', 12345n, 'customer@example.com'),
    ).resolves.toBe('https://checkout.paystack.com/valid');
    const options = fetcher.mock.calls[0][1]!;
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body as string) as unknown).toMatchObject({
      amount: '12345',
      currency: 'NGN',
      reference: 'onecall-test',
    });
  });
  test('verification validates reference, test/live domain, NGN and integer kobo', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch');
    const data = {
      reference: 'onecall-test',
      domain: 'test',
      currency: 'NGN',
      amount: 12345,
      status: 'success',
      customer: { email: 'CUSTOMER@example.com' },
    };
    for (const invalid of [
      { reference: 'different' },
      { domain: 'live' },
      { currency: 'USD' },
      { amount: 123.45 },
      { amount: 0 },
    ]) {
      fetcher.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: true, data: { ...data, ...invalid } }),
        ),
      );
      await expect(gateway.verify('onecall-test')).rejects.toThrow(
        'does not match',
      );
    }
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: true, data })),
    );
    await expect(gateway.verify('onecall-test')).resolves.toEqual({
      successful: true,
      amountKobo: 12345n,
      email: 'customer@example.com',
    });
  });
  test('HTTP-200 vendor errors are private and cannot become a successful payment', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ status: false, message: key })),
      );
    await expect(gateway.verify('onecall-test')).rejects.toThrow(
      'The payment provider did not accept this request',
    );
  });
});
