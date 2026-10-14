import { ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
type Challenge = {
  kind: 'email-verification' | 'phone-verification' | 'password-reset';
  recipient: string;
  selector: string;
  secret: string;
  expiresAt: Date;
};
export function assertDeliveryAvailable(): void {
  if (process.env.NODE_ENV === 'development') return;
  const url = process.env.AUTH_DELIVERY_URL;
  const key = process.env.AUTH_DELIVERY_SECRET;
  let secureUrl = false;
  try {
    const parsed = new URL(url ?? '');
    secureUrl =
      parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    /* Missing or malformed configuration is reported consistently. */
  }
  if (!secureUrl || !key || key.length < 32) {
    throw new ServiceUnavailableException(
      'Verification delivery is not configured',
    );
  }
}
// The operator's adapter sends email/SMS. Production secrets never go to the client.
export async function deliverChallenge(challenge: Challenge): Promise<void> {
  assertDeliveryAvailable();
  if (process.env.NODE_ENV === 'development') return;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(challenge);
  const signature = createHmac('sha256', process.env.AUTH_DELIVERY_SECRET!)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  try {
    const response = await fetch(process.env.AUTH_DELIVERY_URL!, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'content-type': 'application/json',
        'x-onecall-signature': `t=${timestamp},v1=${signature}`,
      },
      body,
    });
    if (!response.ok) throw new Error('Delivery rejected');
  } catch {
    throw new ServiceUnavailableException(
      'Verification delivery is temporarily unavailable',
    );
  }
}
