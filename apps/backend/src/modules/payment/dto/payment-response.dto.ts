import { PaymentStatus } from '@prisma/client';

export class PaymentResponseDto {
  id!: string;
  amount!: string;
  currency!: string;
  status!: PaymentStatus;
  createdAt!: Date;
  updatedAt!: Date;
}
