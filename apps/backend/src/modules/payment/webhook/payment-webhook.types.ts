import { PaymentStatus } from '@prisma/client';

export type PaymentWebhookEventType =
  | 'payment.pending'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded';

export interface PaymentWebhookPayload {
  eventId: string;
  type: PaymentWebhookEventType;
  data: {
    paymentId: string;
    providerReference: string;
    amount: string;
    currency: string;
  };
}

export const PAYMENT_WEBHOOK_TRANSITIONS: Record<
  PaymentWebhookEventType,
  {
    from: PaymentStatus[];
    to: PaymentStatus;
  }
> = {
  'payment.pending': {
    from: [PaymentStatus.INITIATED],
    to: PaymentStatus.PENDING,
  },

  'payment.succeeded': {
    from: [
      PaymentStatus.INITIATED,
      PaymentStatus.PENDING,
    ],
    to: PaymentStatus.SUCCEEDED,
  },

  'payment.failed': {
    from: [
      PaymentStatus.INITIATED,
      PaymentStatus.PENDING,
    ],
    to: PaymentStatus.FAILED,
  },

  'payment.refunded': {
    from: [PaymentStatus.SUCCEEDED],
    to: PaymentStatus.REFUNDED,
  },
};