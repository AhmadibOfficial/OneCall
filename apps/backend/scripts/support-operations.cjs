'use strict';
require('dotenv/config');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const [action, id, responseFile] = process.argv.slice(2);
  if (!['list', 'resolve'].includes(action))
    throw new Error(
      'Usage: support:ops list | support:ops resolve <ticket-uuid> <response-file>',
    );
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    }),
  });
  try {
    if (action === 'list') {
      console.log(
        JSON.stringify(
          await prisma.supportTicket.findMany({
            where: { status: 'OPEN' },
            orderBy: { createdAt: 'asc' },
            take: 50,
            select: {
              id: true,
              subject: true,
              message: true,
              createdAt: true,
              user: { select: { uid: true } },
            },
          }),
          null,
          2,
        ),
      );
      return;
    }
    if (!/^[0-9a-f-]{36}$/.test(id ?? '') || !responseFile)
      throw new Error('Provide a ticket UUID and response file');
    const response = fs.readFileSync(responseFile, 'utf8').trim();
    if (!response || response.length > 2000)
      throw new Error('Response must contain 1–2000 characters');
    await prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUniqueOrThrow({
        where: { id },
      });
      const result = await tx.supportTicket.updateMany({
        where: { id, status: 'OPEN' },
        data: { response, status: 'RESOLVED' },
      });
      if (result.count)
        await tx.notification.create({
          data: {
            userId: ticket.userId,
            title: 'Support response',
            body: 'Operations responded to your support request. Open Support to read it.',
          },
        });
    });
    console.log(JSON.stringify({ id, resolved: true }));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Support operation failed. Check arguments, configuration and ticket ID.',
  );
  process.exitCode = 1;
});
