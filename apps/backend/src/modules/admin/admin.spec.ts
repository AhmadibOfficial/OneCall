import { ExecutionContext } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
import { AdminController, AdminGuard } from './admin.module';

describe('Admin access and support operations', () => {
  const context = (user?: { id: string }) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;
  it('denies requests with no authenticated user without querying roles', async () => {
    const findFirst = jest.fn();
    const guard = new AdminGuard({
      userRole: { findFirst },
    } as unknown as PrismaService);
    expect(await guard.canActivate(context())).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('checks the current database role; customer/provider identity alone does not grant access', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: 'admin' });
    const guard = new AdminGuard({
      userRole: { findFirst },
    } as unknown as PrismaService);
    expect(await guard.canActivate(context({ id: 'customer' }))).toBe(false);
    expect(await guard.canActivate(context({ id: 'admin' }))).toBe(true);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { userId: 'admin', role: { name: 'ADMIN' } },
      select: { userId: true },
    });
  });
  it('a repeated support resolution cannot send a second notification', async () => {
    const create = jest.fn();
    const tx = {
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'owner' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      notification: { create },
    };
    const controller = new AdminController({
      $transaction: (callback: (value: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaService);
    await expect(
      controller.resolve('ticket', { response: 'Reviewed' }),
    ).rejects.toThrow('already been resolved');
    expect(create).not.toHaveBeenCalled();
  });
  it('resolves the ticket and notifies its owner within one transaction', async () => {
    const create = jest.fn();
    const tx = {
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'owner' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { create },
    };
    const controller = new AdminController({
      $transaction: (callback: (value: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaService);
    expect(
      await controller.resolve('ticket', { response: ' Reviewed ' }),
    ).toEqual({ id: 'ticket', resolved: true });
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'owner',
        title: 'Support response',
        body: 'Operations responded to your support request. Open Support to read it.',
      },
    });
    expect(tx.supportTicket.updateMany).toHaveBeenCalledWith({
      where: { id: 'ticket', status: 'OPEN' },
      data: { response: 'Reviewed', status: 'RESOLVED' },
    });
  });
});
