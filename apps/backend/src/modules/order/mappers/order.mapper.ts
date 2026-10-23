import { Prisma } from '@prisma/client';
import { OrderResponseDto } from '../dto/order-response.dto';

type OrderResponseSource = {
  id: string;
  serviceName: string;
  city?: string;
  state?: string;
  address?: string | null;
  description: string | null;
  amount: Prisma.Decimal | null;
  status: OrderResponseDto['status'];
  providerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  pickupAddress?: string | null;
  destinationAddress?: string | null;
  scheduledAt?: Date | null;
  vehicleType?: string | null;
  quote?: {
    id: string;
    amount: Prisma.Decimal | null;
    acceptedAt: Date | null;
  } | null;
  provider?: {
    displayName: string | null;
    vehicleDescription: string | null;
    user: { uid: string; firstName: string; lastName: string; phone: string };
  } | null;
  payments?: { status: string; providerMode?: string | null }[];
};

export class OrderMapper {
  static toResponse(this: void, order: OrderResponseSource): OrderResponseDto {
    return {
      id: order.id,
      serviceName: order.serviceName,
      city: order.city ?? 'Kaduna',
      state: order.state ?? 'Kaduna',
      address: order.address ?? null,
      description: order.description,
      amount:
        order.amount === null || order.amount === undefined
          ? null
          : order.amount.toFixed(2),
      status: order.status,
      providerAssigned: order.providerId !== null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      pickupAddress: order.pickupAddress ?? null,
      destinationAddress: order.destinationAddress ?? null,
      scheduledAt: order.scheduledAt ?? null,
      vehicleType: order.vehicleType ?? null,
      quote: order.quote
        ? {
            id: order.quote.id,
            amount: order.quote.amount!.toFixed(2),
            acceptedAt: order.quote.acceptedAt,
          }
        : null,
      provider: order.provider
        ? {
            uid: order.provider.user.uid,
            name:
              order.provider.displayName ??
              `${order.provider.user.firstName} ${order.provider.user.lastName}`.trim(),
            phone: order.provider.user.phone,
            vehicleDescription: order.provider.vehicleDescription,
          }
        : null,
      paymentStatus: order.payments?.[0]?.status ?? null,
      paymentMode: order.payments?.[0]?.providerMode ?? null,
    };
  }
}
