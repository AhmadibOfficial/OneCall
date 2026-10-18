import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
import { cityKey } from '@/modules/services/nigeria';
import {
  AddressDto,
  ProviderApplicationDto,
  ProfileDto,
  LocationDto,
  SupportDto,
} from './marketplace.dto';

const providerSelect = {
  approved: true,
  displayName: true,
  vehicleDescription: true,
  coverage: { select: { state: true, cityKey: true, serviceName: true } },
} as const;

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  tickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        subject: true,
        message: true,
        status: true,
        response: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
  async support(userId: string, data: SupportDto) {
    if (!data.subject.trim() || !data.message.trim())
      throw new BadRequestException('Enter your subject and message');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      if (
        (await tx.supportTicket.count({ where: { userId, status: 'OPEN' } })) >=
        5
      )
        throw new ConflictException(
          'You already have five open support requests',
        );
      return tx.supportTicket.create({
        data: {
          userId,
          subject: data.subject.trim(),
          message: data.message.trim(),
        },
        select: { id: true, subject: true, status: true, createdAt: true },
      });
    });
  }

  favorites(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId },
      select: { serviceName: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async favorite(userId: string, serviceName: string, add: boolean) {
    if (add)
      await this.prisma.favorite.upsert({
        where: { userId_serviceName: { userId, serviceName } },
        create: { userId, serviceName },
        update: {},
      });
    else
      await this.prisma.favorite.deleteMany({ where: { userId, serviceName } });
    return { saved: add };
  }
  notifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        orderId: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
    });
  }
  async readNotification(userId: string, id?: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, ...(id ? { id } : {}), readAt: null },
      data: { readAt: new Date() },
    });
    if (
      id &&
      result.count === 0 &&
      !(await this.prisma.notification.findFirst({ where: { userId, id } }))
    )
      throw new NotFoundException('Notification not found');
    return { markedRead: true };
  }
  addresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        label: true,
        addressLine1: true,
        landmark: true,
        lga: true,
        state: true,
        city: true,
        isDefault: true,
      },
    });
  }
  async saveAddress(userId: string, input: AddressDto, id?: string) {
    cityKey(input.city);
    if (!input.addressLine1.trim() || !input.label.trim())
      throw new BadRequestException('Enter an address and label');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      if (id && !(await tx.address.findFirst({ where: { id, userId } })))
        throw new NotFoundException('Address not found');
      const count = await tx.address.count({ where: { userId } });
      if (!id && count >= 20)
        throw new ConflictException('You can save up to 20 addresses');
      const isDefault = input.isDefault === true || count === 0;
      if (isDefault)
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      const data = {
        label: input.label.trim(),
        addressLine1: input.addressLine1.trim(),
        landmark: input.landmark?.trim() || null,
        lga: input.lga?.trim() || null,
        city: input.city.trim(),
        state: input.state,
        isDefault,
      };
      const address = id
        ? await tx.address.update({ where: { id }, data })
        : await tx.address.create({ data: { userId, ...data } });
      return { id: address.id, ...data };
    });
  }
  async deleteAddress(userId: string, id: string) {
    const result = await this.prisma.address.deleteMany({
      where: { userId, id },
    });
    if (!result.count) throw new NotFoundException('Address not found');
    return { deleted: true };
  }
  async profile(userId: string, input: ProfileDto) {
    if (!input.firstName.trim() || !input.lastName.trim())
      throw new BadRequestException('Enter your first and last name');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
      },
    });
    return { updated: true };
  }
  provider(userId: string) {
    return this.prisma.provider
      .findUnique({ where: { userId }, select: providerSelect })
      .then((provider) => ({ provider }));
  }
  async apply(userId: string, input: ProviderApplicationDto) {
    const key = cityKey(input.city);
    if (!input.displayName.trim())
      throw new BadRequestException('Enter a provider name');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const previous = await tx.provider.findUnique({ where: { userId } });
      if (previous?.approved)
        throw new ConflictException(
          'Contact operations to change an approved service area',
        );
      const provider = await tx.provider.upsert({
        where: { userId },
        create: {
          userId,
          displayName: input.displayName.trim(),
          vehicleDescription: input.vehicleDescription?.trim() || null,
        },
        update: {
          displayName: input.displayName.trim(),
          vehicleDescription: input.vehicleDescription?.trim() || null,
        },
      });
      await tx.providerCoverage.deleteMany({
        where: { providerId: provider.id },
      });
      await tx.providerCoverage.createMany({
        data: input.serviceNames.map((serviceName) => ({
          providerId: provider.id,
          state: input.state,
          cityKey: key,
          serviceName,
        })),
      });
      return tx.provider.findUniqueOrThrow({
        where: { id: provider.id },
        select: providerSelect,
      });
    });
  }
  private async ownedOrder(
    userId: string,
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const order = await tx.order.findFirst({
      where: { id, OR: [{ customerId: userId }, { provider: { userId } }] },
      include: { provider: { select: { userId: true, approved: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
  async quote(userId: string, id: string, amount: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const order = await this.ownedOrder(userId, id, tx);
      if (!order.provider?.approved || order.provider.userId !== userId)
        throw new NotFoundException('Assigned provider required');
      if (order.status !== 'ACCEPTED' || order.amount !== null)
        throw new ConflictException(
          'A quote can only be proposed before work and before customer acceptance',
        );
      const quote = await tx.orderQuote.upsert({
        where: { orderId: id },
        create: { orderId: id, amount: new Prisma.Decimal(amount) },
        update: {
          id: randomUUID(),
          amount: new Prisma.Decimal(amount),
          acceptedAt: null,
          createdAt: new Date(),
        },
      });
      await tx.notification.create({
        data: {
          userId: order.customerId,
          orderId: id,
          title: 'Quote ready',
          body: `Your provider quoted ₦${quote.amount.toFixed(2)}. Review and accept it before paying.`,
        },
      });
      return {
        id: quote.id,
        amount: quote.amount.toFixed(2),
        acceptedAt: quote.acceptedAt,
      };
    });
  }
  async acceptQuote(userId: string, id: string, quoteId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const order = await this.ownedOrder(userId, id, tx);
      if (order.customerId !== userId)
        throw new NotFoundException('Customer order not found');
      const quote = await tx.orderQuote.findFirst({
        where: { id: quoteId, orderId: id },
      });
      if (!quote)
        throw new ConflictException(
          'This quote was replaced. Refresh the request.',
        );
      if (quote.acceptedAt) return { accepted: true };
      if (order.status !== 'ACCEPTED')
        throw new ConflictException('This request cannot accept a quote now');
      await tx.order.update({ where: { id }, data: { amount: quote.amount } });
      await tx.orderQuote.update({
        where: { id: quoteId },
        data: { acceptedAt: new Date() },
      });
      if (order.provider)
        await tx.notification.create({
          data: {
            userId: order.provider.userId,
            orderId: id,
            title: 'Quote accepted',
            body: 'The customer accepted your quote.',
          },
        });
      return { accepted: true };
    });
  }
  async tracking(userId: string, id: string) {
    const order = await this.ownedOrder(userId, id);
    const location =
      order.status === 'IN_PROGRESS'
        ? await this.prisma.orderLocation.findUnique({ where: { orderId: id } })
        : null;
    return {
      location: location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            updatedAt: location.updatedAt,
          }
        : null,
    };
  }
  async shareLocation(userId: string, id: string, data: LocationDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const order = await this.ownedOrder(userId, id, tx);
      if (order.provider?.userId !== userId || !order.provider.approved)
        throw new NotFoundException('Assigned provider required');
      if (order.status !== 'IN_PROGRESS')
        throw new ConflictException(
          'Location sharing is available while work is in progress',
        );
      await tx.orderLocation.upsert({
        where: { orderId: id },
        create: { orderId: id, ...data },
        update: data,
      });
      return { shared: true };
    });
  }
  async messages(userId: string, id: string) {
    await this.ownedOrder(userId, id);
    const messages = await this.prisma.orderMessage.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return messages.reverse().map((message) => ({
      id: message.id,
      text: message.text,
      mine: message.senderId === userId,
      createdAt: message.createdAt,
    }));
  }
  async sendMessage(userId: string, id: string, text: string) {
    if (!text.trim()) throw new BadRequestException('Enter a message');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const order = await this.ownedOrder(userId, id, tx);
      if (
        !order.provider ||
        !['ACCEPTED', 'IN_PROGRESS'].includes(order.status)
      )
        throw new ConflictException(
          'Chat is available during an assigned booking',
        );
      const message = await tx.orderMessage.create({
        data: { orderId: id, senderId: userId, text: text.trim() },
      });
      const recipient =
        userId === order.customerId ? order.provider.userId : order.customerId;
      await tx.notification.create({
        data: {
          userId: recipient,
          orderId: id,
          title: 'New booking message',
          body: 'Open your booking to read the message.',
        },
      });
      return {
        id: message.id,
        text: message.text,
        mine: true,
        createdAt: message.createdAt,
      };
    });
  }
  async customerContact(userId: string, id: string) {
    const order = await this.ownedOrder(userId, id);
    if (order.provider?.userId !== userId || !order.provider.approved)
      throw new NotFoundException('Assigned provider required');
    const customer = await this.prisma.user.findUniqueOrThrow({
      where: { id: order.customerId },
      select: { firstName: true, lastName: true, phone: true },
    });
    return {
      name: `${customer.firstName} ${customer.lastName}`.trim(),
      phone: customer.phone,
    };
  }
}
