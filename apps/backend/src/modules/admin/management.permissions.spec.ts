import {
  allows,
  permissionsFor,
  managementActor,
} from './management.permissions';
import { Prisma } from '@prisma/client';

describe('Management permissions', () => {
  it('grants owner authority only to ADMIN, denying customer, provider and unknown roles', () => {
    expect(allows(['ADMIN'], 'owner')).toBe(true);
    for (const role of ['CUSTOMER', 'PROVIDER', 'ONECALL_FAKE', 'admin'])
      expect(permissionsFor([role])).toEqual([]);
  });
  it('keeps dispatch separate from customer, finance, staff and parcel authority', () => {
    expect(allows(['ONECALL_DISPATCH'], 'bookings.write')).toBe(true);
    for (const permission of [
      'customers',
      'finance',
      'owner',
      'providers.write',
    ])
      expect(allows(['ONECALL_DISPATCH'], permission)).toBe(false);
    expect(allows(['ONECALL_SUPPORT'], 'support.write')).toBe(true);
    expect(allows(['ONECALL_FINANCE'], 'bookings.write')).toBe(false);
  });
  it('locks the account then checks its current active roles inside the mutation transaction', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: {
        findFirst: jest.fn().mockResolvedValue({
          roles: [{ role: { name: 'ONECALL_SUPPORT' } }],
        }),
      },
    };
    await expect(
      managementActor(
        db as unknown as Prisma.TransactionClient,
        'account',
        'bookings.write',
      ),
    ).rejects.toThrow('permissions');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'account', status: 'ACTIVE', deletedAt: null },
      }),
    );
    db.user.findFirst.mockResolvedValue(null);
    await expect(
      managementActor(
        db as unknown as Prisma.TransactionClient,
        'account',
        'support.write',
      ),
    ).rejects.toThrow('permissions');
  });
});
