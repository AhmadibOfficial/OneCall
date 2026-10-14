import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { cityKey, NIGERIA_SERVICES } from '@/modules/services/nigeria';

import { CreateOrderDto } from '../dto/create-order.dto';
import { OrderMapper } from '../mappers/order.mapper';
import { OrderRepository } from '../repositories/order.repository';

@Injectable()
export class OrderService {
  constructor(private readonly orderRepository: OrderRepository) {}

  async create(customerId: string, data: CreateOrderDto) {
    const service = NIGERIA_SERVICES.find(
      (item) =>
        item.name.toLowerCase() === data.serviceName.trim().toLowerCase(),
    );
    if (!service)
      throw new BadRequestException(
        'Choose a service from the OneCall catalogue',
      );
    if ((data.city && !data.state) || (data.state && !data.city)) {
      throw new BadRequestException('Choose both state and city');
    }
    data.serviceName = service.name;
    data.state ??= 'Kaduna';
    data.city ??= 'Kaduna';
    cityKey(data.city);
    if (
      (service.kind === 'ride' || service.kind === 'delivery') &&
      (!data.pickupAddress?.trim() || !data.destinationAddress?.trim())
    ) {
      throw new BadRequestException('Enter pickup and destination addresses');
    }
    if (data.scheduledAt) {
      const time = new Date(data.scheduledAt).getTime();
      if (
        !/(Z|[+-]\d{2}:\d{2})$/i.test(data.scheduledAt) ||
        time < Date.now() ||
        time > Date.now() + 365 * 86400000
      ) {
        throw new BadRequestException(
          'Schedule a time within the next year, including a timezone',
        );
      }
    }
    const order = await this.orderRepository.create(customerId, data);

    return OrderMapper.toResponse(order);
  }

  async findManyForUser(userId: string) {
    const orders = await this.orderRepository.findManyForUser(userId);

    return orders.map(OrderMapper.toResponse);
  }

  async findById(userId: string, orderId: string) {
    const order = await this.orderRepository.findByIdForUser(orderId, userId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return OrderMapper.toResponse(order);
  }

  async findAvailable(userId: string) {
    const provider = await this.orderRepository.findProviderByUserId(userId);

    if (!provider?.approved) {
      throw new ForbiddenException('Provider account required');
    }

    const orders = await this.orderRepository.findAvailableOrders(provider.id);

    return orders.map((order) =>
      OrderMapper.toResponse({
        ...order,
        address: null,
        description: null,
        pickupAddress: null,
        destinationAddress: null,
      }),
    );
  }

  async accept(userId: string, orderId: string) {
    const provider = await this.orderRepository.findProviderByUserId(userId);

    if (!provider?.approved) {
      throw new ForbiddenException('Provider account required');
    }

    const result = await this.orderRepository.claimPendingOrder(
      orderId,
      provider.id,
    );

    if (result.count !== 1) {
      throw new NotFoundException('Order not available');
    }

    return this.findById(userId, orderId);
  }

  async start(userId: string, orderId: string) {
    const provider = await this.orderRepository.findProviderByUserId(userId);

    if (!provider?.approved) {
      throw new ForbiddenException('Provider account required');
    }

    const ownedOrder = await this.orderRepository.findByIdForUser(
      orderId,
      userId,
    );

    if (!ownedOrder) {
      throw new NotFoundException('Order not found');
    }

    const result = await this.orderRepository.startOrder(orderId, provider.id);

    if (result.count !== 1) {
      throw new ConflictException(
        'Order cannot be started from its current state',
      );
    }

    return this.findById(userId, orderId);
  }

  async complete(userId: string, orderId: string) {
    const provider = await this.orderRepository.findProviderByUserId(userId);

    if (!provider?.approved) {
      throw new ForbiddenException('Provider account required');
    }

    const ownedOrder = await this.orderRepository.findByIdForUser(
      orderId,
      userId,
    );

    if (!ownedOrder) {
      throw new NotFoundException('Order not found');
    }

    const result = await this.orderRepository.completeOrder(
      orderId,
      provider.id,
    );

    if (result.count !== 1) {
      throw new ConflictException(
        'Order cannot be completed from its current state',
      );
    }

    return this.findById(userId, orderId);
  }

  async cancel(userId: string, orderId: string) {
    const ownedOrder = await this.orderRepository.findByCustomer(
      orderId,
      userId,
    );

    if (!ownedOrder) {
      throw new NotFoundException('Order not found');
    }

    const result = await this.orderRepository.cancelOrder(orderId, userId);

    if (result.count !== 1) {
      throw new ConflictException(
        'Order cannot be cancelled from its current state',
      );
    }

    return this.findById(userId, orderId);
  }
}
