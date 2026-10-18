import { PaymentResponseDto } from '../dto/payment-response.dto';

type PaymentSource = {
  id: string;
  amount: unknown;
  currency: string;
  status: PaymentResponseDto['status'];
  createdAt: Date;
  updatedAt: Date;
};

export class PaymentMapper {
  static toResponse(
    payment: PaymentSource,
  ): PaymentResponseDto {
    return {
      id: payment.id,
      amount: String(payment.amount),
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
