import { ServicesController } from './services.module';
import { PrismaService } from '@/infrastructure/database/prisma';

it('starts independent catalogue queries together and preserves availability counts', async () => {
  let finishAreas!: (value: unknown[]) => void;
  let finishRoutes!: (value: unknown[]) => void;
  const coverage = jest.fn(
    (_query: unknown) =>
      new Promise<unknown[]>((resolve) => {
        finishAreas = resolve;
      }),
  );
  const routes = jest.fn(
    (_query: unknown) =>
      new Promise<unknown[]>((resolve) => {
        finishRoutes = resolve;
      }),
  );
  const prisma = {
    providerCoverage: { findMany: coverage },
    parcelRoute: { findMany: routes },
  } as unknown as PrismaService;
  const pending = new ServicesController(prisma).list({
    state: 'Kaduna',
    city: 'Kaduna',
  });
  expect(coverage).toHaveBeenCalledTimes(1);
  expect(routes).toHaveBeenCalledTimes(1);
  finishAreas([
    { serviceName: 'Tailoring', providerId: 'provider-1' },
    { serviceName: 'Tailoring', providerId: 'provider-1' },
  ]);
  finishRoutes([{ originAgentId: 'agent-1' }]);
  const result = await pending;
  expect(
    result.services.find((service) => service.key === 'tailoring')
      ?.availableProviders,
  ).toBe(1);
  expect(
    result.services.find((service) => service.key === 'parcel-delivery')
      ?.availableProviders,
  ).toBe(1);
  expect(coverage.mock.calls[0][0]).toMatchObject({
    where: {
      provider: { approved: true, user: { status: 'ACTIVE', deletedAt: null } },
    },
  });
});
