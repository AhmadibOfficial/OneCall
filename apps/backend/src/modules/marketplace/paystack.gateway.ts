import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ServiceUnavailableException('Invalid payment provider response');
  return value as JsonObject;
}

@Injectable()
export class PaystackGateway {
  constructor(private readonly config: ConfigService) {}
  get enabled() {
    return /^sk_(test|live)_[A-Za-z0-9]+$/.test(
      this.config.get<string>('PAYSTACK_SECRET_KEY') ?? '',
    );
  }
  get walletEnabled() {
    return (
      this.enabled &&
      this.config.get<string>('ONECALL_WALLET_ENABLED') === 'true'
    );
  }
  private secret() {
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY') ?? '';
    if (!this.enabled)
      throw new ServiceUnavailableException(
        'Secure checkout is not configured yet',
      );
    return secret;
  }
  private async request(path: string, body?: JsonObject) {
    const key = this.secret();
    let response: Response;
    try {
      response = await fetch('https://api.paystack.co' + path, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Secure checkout is temporarily unavailable',
      );
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Secure checkout is temporarily unavailable',
      );
    const value = object(await response.json());
    if (value.status !== true)
      throw new ServiceUnavailableException(
        'The payment provider did not accept this request',
      );
    return object(value.data);
  }
  async initialize(reference: string, amountKobo: bigint, email: string) {
    const data = await this.request('/transaction/initialize', {
      reference,
      amount: amountKobo.toString(),
      email,
      currency: 'NGN',
    });
    if (
      data.reference !== reference ||
      typeof data.authorization_url !== 'string'
    )
      throw new ServiceUnavailableException('Invalid checkout response');
    const url = new URL(data.authorization_url);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'checkout.paystack.com' ||
      url.username ||
      url.password ||
      url.port
    ) {
      throw new ServiceUnavailableException('Invalid checkout address');
    }
    return url.toString();
  }
  async verify(reference: string) {
    const data = await this.request(
      '/transaction/verify/' + encodeURIComponent(reference),
    );
    const expectedDomain = this.secret().startsWith('sk_live_')
      ? 'live'
      : 'test';
    if (
      data.reference !== reference ||
      data.domain !== expectedDomain ||
      data.currency !== 'NGN' ||
      typeof data.amount !== 'number' ||
      !Number.isSafeInteger(data.amount) ||
      data.amount <= 0
    ) {
      throw new ConflictException(
        'The verified transaction does not match this checkout',
      );
    }
    const customer = object(data.customer);
    if (typeof customer.email !== 'string')
      throw new ConflictException('Invalid payment customer');
    return {
      successful: data.status === 'success',
      amountKobo: BigInt(data.amount),
      email: customer.email.toLowerCase(),
    };
  }
  verifySignature(rawBody: Buffer | undefined, signature: string | undefined) {
    const key = this.secret();
    if (!rawBody || !signature || !/^[0-9a-f]{128}$/i.test(signature))
      throw new UnauthorizedException('Invalid payment signature');
    const expected = createHmac('sha512', key).update(rawBody).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw new UnauthorizedException('Invalid payment signature');
  }
}
