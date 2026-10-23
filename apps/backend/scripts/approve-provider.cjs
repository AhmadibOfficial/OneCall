'use strict';
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const {
  NIGERIA_STATES,
  NIGERIA_SERVICES,
  cityKey,
} = require('../dist/modules/services/nigeria');
async function approve(uid, state, city, keys) {
  if (
    !/^\d{10}$/.test(uid ?? '') ||
    !NIGERIA_STATES.includes(state) ||
    !city ||
    !Array.isArray(keys) ||
    !keys.length
  )
    throw new Error(
      'Usage: provider:approve <uid> <state> <city> <service-key,service-key>',
    );
  const names = [
    ...new Set(
      keys.map((key) => {
        const item = NIGERIA_SERVICES.find((s) => s.key === key);
        if (!item)
          throw new Error('Invalid service key; use keys from GET /services');
        return item.name;
      }),
    ),
  ];
  const normalized = city === '*' ? '*' : cityKey(city);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    }),
  });
  try {
    const provider = await prisma.$transaction(async (tx) => {
      const snapshot = await tx.user.findUnique({
        where: { uid },
        select: { id: true },
      });
      if (!snapshot) throw new Error('No account has that UID');
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${snapshot.id}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: snapshot.id },
      });
      if (user.deletedAt || user.status !== 'ACTIVE' || !user.emailVerified)
        throw new Error('Provider must first register and verify their email');
      const p = await tx.provider.upsert({
        where: { userId: user.id },
        create: { userId: user.id, approved: true },
        update: {},
      });
      await tx.$queryRaw`SELECT "id" FROM "Provider" WHERE "id" = ${p.id}::uuid FOR UPDATE`;
      // Pending applications are proposals, not operator-approved coverage.
      if (!p.approved)
        await tx.providerCoverage.deleteMany({ where: { providerId: p.id } });
      await tx.provider.update({
        where: { id: p.id },
        data: { approved: true },
      });
      for (const serviceName of names)
        await tx.providerCoverage.upsert({
          where: {
            providerId_state_cityKey_serviceName: {
              providerId: p.id,
              state,
              cityKey: normalized,
              serviceName,
            },
          },
          create: { providerId: p.id, state, cityKey: normalized, serviceName },
          update: {},
        });
      return p;
    });
    return {
      uid,
      providerId: provider.id,
      approved: true,
      state,
      city: normalized,
      services: names,
    };
  } finally {
    await prisma.$disconnect();
  }
}
module.exports = { approve };
if (require.main === module)
  approve(
    process.argv[2],
    process.argv[3],
    process.argv[4],
    (process.argv[5] ?? '').split(','),
  )
    .then((value) => console.log(JSON.stringify(value)))
    .catch((error) => {
      const safe =
        /Usage:|Invalid service key|DATABASE_URL is required|No account|must first register/.test(
          error.message,
        )
          ? error.message
          : 'Provider approval failed. Check configuration and database availability.';
      console.error(safe);
      process.exitCode = 1;
    });
