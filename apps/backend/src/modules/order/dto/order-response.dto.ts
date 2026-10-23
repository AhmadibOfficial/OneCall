import { OrderStatus } from '@prisma/client';

export class OrderResponseDto {
  id!: string;
  serviceName!: string;
  city!: string;
  state!: string;
  address!: string | null;
  description!: string | null;
  amount!: string | null;
  status!: OrderStatus;
  providerAssigned!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  pickupAddress!: string | null;
  destinationAddress!: string | null;
  scheduledAt!: Date | null;
  vehicleType!: string | null;
  quote!: { id: string; amount: string; acceptedAt: Date | null } | null;
  provider!: {
    uid: string;
    name: string;
    phone: string;
    vehicleDescription: string | null;
  } | null;
  paymentStatus!: string | null;
  paymentMode!: string | null;
}
