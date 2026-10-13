'use strict';
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
async function main() {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.DATABASE_URL !==
      'postgresql://onecall_local:onecall_local_only@127.0.0.1:54329/onecall_pilot'
  )
    throw new Error('Use the existing local development pilot only.');
  const uid = process.argv[2];
  if (!/^\d{10}$/.test(uid || ''))
    throw new Error('Provide the UID of your existing admin account.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    }),
  });
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { uid } });
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
      if (user.deletedAt || user.status !== 'ACTIVE')
        throw new Error('Account is unavailable.');
      const role = await tx.role.upsert({
        where: { name: 'ADMIN' },
        create: {
          name: 'ADMIN',
          description: 'OneCall operations administrator',
        },
        update: {},
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: {},
      });
    });
    console.log(
      'Local admin access granted to UID ' +
        uid +
        '. Sign in with that account’s email.',
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Admin grant failed. Check local configuration and account UID.',
  );
  process.exitCode = 1;
});
