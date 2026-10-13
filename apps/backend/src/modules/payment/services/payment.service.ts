import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';

import { CreatePaymentDto } from '../dto/create-payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { PaymentRepository } from '../repositories/payment.repository';

@Injectable()
export class PaymentService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
  ) {}

  async initialize(
    customerId: string,
    orderId: string,
    data: CreatePaymentDto,
  ) {
    const order =
      await this.paymentRepository.findOrderForCustomer(
        orderId,
        customerId,
      );

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      order.status === 'CANCELLED'
    ) {
      throw new ConflictException(
        'Cannot initialize payment for a cancelled order',
      );
    }

    if (
      order.amount === null ||
      Number(order.amount) <= 0
    ) {
      throw new ConflictException(
        'Order does not have a payable amount',
      );
    }

    const existing =
      await this.paymentRepository.findByIdempotencyKey(
        data.idempotencyKey,
      );

    if (existing) {
      if (
        existing.order.customerId !== customerId ||
        existing.order.id !== orderId
      ) {
        throw new ConflictException(
          'Idempotency key is already in use',
        );
      }

      return PaymentMapper.toResponse(existing);
    }

    const payment =
      await this.paymentRepository.create(
        order.id,
        order.amount,
        'NGN',
        data.idempotencyKey,
      );

    return PaymentMapper.toResponse(payment);
  }

  async moveToPending(paymentId: string) {
    const result =
      await this.paymentRepository.moveToPending(
        paymentId,
      );

    if (result.count !== 1) {
      throw new ConflictException(
        'Payment cannot enter pending state',
      );
    }

    return this.get(paymentId);
  }

  async markSucceeded(
    paymentId: string,
    providerReference: string,
  ) {
    if (!providerReference) {
      throw new ConflictException(
        'Provider reference is required',
      );
    }

    const result =
      await this.paymentRepository.markSucceeded(
        paymentId,
        providerReference,
      );

    if (result.count !== 1) {
      throw new ConflictException(
        'Payment cannot enter succeeded state',
      );
    }

    return this.get(paymentId);
  }

  async markFailed(paymentId: string) {
    const result =
      await this.paymentRepository.markFailed(
        paymentId,
      );

    if (result.count !== 1) {
      throw new ConflictException(
        'Payment cannot enter failed state',
      );
    }

    return this.get(paymentId);
  }

  async refund(paymentId: string) {
    const result =
      await this.paymentRepository.markRefunded(
        paymentId,
      );

    if (result.count !== 1) {
      throw new ConflictException(
        'Payment cannot be refunded from its current state',
      );
    }

    return this.get(paymentId);
  }

  async get(paymentId: string) {
    const payment =
      await this.paymentRepository.findById(
        paymentId,
      );

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return PaymentMapper.toResponse(payment);
  }
}
