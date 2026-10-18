import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

@Injectable()
export class PaymentWebhookSignatureService {
  private readonly secret: Buffer;
  private readonly toleranceSeconds: number;

  constructor(
    secretOverride?: string,
    toleranceOverride?: number,
  ) {
    const secret =
      secretOverride ??
      process.env.PAYMENT_WEBHOOK_SECRET;

    if (!secret || secret.length < 32) {
      throw new Error(
        'PAYMENT_WEBHOOK_SECRET must be configured with at least 32 characters',
      );
    }

    const tolerance =
      toleranceOverride ??
      Number(
        process.env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS ??
          '300',
      );

    if (
      !Number.isInteger(tolerance) ||
      tolerance < 1 ||
      tolerance > 3600
    ) {
      throw new Error(
        'PAYMENT_WEBHOOK_TOLERANCE_SECONDS must be an integer between 1 and 3600',
      );
    }

    this.secret = Buffer.from(secret, 'utf8');
    this.toleranceSeconds = tolerance;
  }

  verify(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    nowMs = Date.now(),
  ): void {
    if (
      !Buffer.isBuffer(rawBody) ||
      rawBody.length === 0 ||
      typeof signatureHeader !== 'string'
    ) {
      throw new UnauthorizedException(
        'Invalid webhook signature',
      );
    }

    const parts = signatureHeader
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    const timestampPart = parts.find(
      (part) => part.startsWith('t='),
    );

    const signatures = parts
      .filter((part) => part.startsWith('v1='))
      .map((part) => part.slice(3))
      .filter((value) => /^[0-9a-f]{64}$/i.test(value));

    if (
      !timestampPart ||
      signatures.length === 0
    ) {
      throw new UnauthorizedException(
        'Invalid webhook signature',
      );
    }

    const timestampText =
      timestampPart.slice(2);

    if (!/^\d+$/.test(timestampText)) {
      throw new UnauthorizedException(
        'Invalid webhook signature',
      );
    }

    const timestamp = Number(timestampText);

    if (
      !Number.isSafeInteger(timestamp) ||
      timestamp <= 0
    ) {
      throw new UnauthorizedException(
        'Invalid webhook signature',
      );
    }

    const nowSeconds =
      Math.floor(nowMs / 1000);

    if (
      Math.abs(
        nowSeconds - timestamp,
      ) > this.toleranceSeconds
    ) {
      throw new UnauthorizedException(
        'Webhook timestamp outside replay window',
      );
    }

    const signedPayload =
      Buffer.concat([
        Buffer.from(
          `${timestamp}.`,
          'utf8',
        ),
        rawBody,
      ]);

    const expected =
      createHmac(
        'sha256',
        this.secret,
      )
        .update(signedPayload)
        .digest();

    for (const candidate of signatures) {
      const supplied =
        Buffer.from(
          candidate,
          'hex',
        );

      if (
        supplied.length ===
          expected.length &&
        timingSafeEqual(
          supplied,
          expected,
        )
      ) {
        return;
      }
    }

    throw new UnauthorizedException(
      'Invalid webhook signature',
    );
  }
}
