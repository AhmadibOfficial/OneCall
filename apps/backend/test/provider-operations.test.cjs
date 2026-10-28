'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const path = require('node:path');

if (process.env.ONECALL_ALLOW_TEST_DATABASE !== 'true')
  throw new Error('Use a disposable test database for operator tests');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
});
const backend = path.resolve(__dirname, '..');
function approve(uid, state, city, services) {
  return spawnSync(
    process.execPath,
    ['scripts/approve-provider.cjs', uid, state, city, services],
    { cwd: backend, env: process.env, encoding: 'utf8', timeout: 20000 },
  );
}
async function account(active) {
  const uid = String(
    (BigInt('0x' + randomBytes(5).toString('hex')) % 9000000000n) + 1000000000n,
  );
  return prisma.user.create({
    data: {
      uid,
      email: 'ops-' + uid + '@example.com',
      phone: '+2348' + uid,
      passwordHash: 'operator-test-no-login',
      firstName: 'Operations',
      lastName: 'Test',
      status: active ? 'ACTIVE' : 'PENDING',
      emailVerified: false,
      phoneVerified: false,
    },
  });
}
test('operator approval rejects inactive accounts and grants only vetted coverage idempotently', async () => {
  const users = [];
  try {
    const pending = await account(false);
    users.push(pending.id);
    const denied = approve(pending.uid, 'Lagos', 'Ikeja', 'ride');
    assert.equal(denied.status, 1);
    assert.equal(
      await prisma.provider.count({ where: { userId: pending.id } }),
      0,
    );
    const active = await account(true);
    users.push(active.id);
    const proposal = await prisma.provider.create({
      data: {
        userId: active.id,
        coverage: {
          create: { state: 'Lagos', cityKey: 'ikeja', serviceName: 'Plumbing' },
        },
      },
    });
    for (let i = 0; i < 2; i++) {
      const result = approve(active.uid, 'Kaduna', 'Kaduna', 'tailoring');
      assert.equal(result.status, 0, result.stderr);
    }
    const provider = await prisma.provider.findUniqueOrThrow({
      where: { id: proposal.id },
      include: { coverage: true },
    });
    assert.equal(provider.approved, true);
    assert.equal(provider.coverage.length, 1);
    assert.deepEqual(
      provider.coverage.map((c) => [c.state, c.cityKey, c.serviceName]),
      [['Kaduna', 'kaduna', 'Tailoring']],
    );
    assert.equal(
      approve(active.uid, 'Lagos', 'Ikeja', 'not-a-service').status,
      1,
    );
    assert.equal(
      await prisma.providerCoverage.count({
        where: { providerId: provider.id },
      }),
      1,
    );
  } finally {
    await prisma.provider.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
});
test('support responses are stored and notify only the ticket owner', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const user = await account(true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onecall-support-test-'));
  try {
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: user.id,
        subject: 'Test issue',
        message: 'Test message ' + randomUUID(),
      },
    });
    const response = path.join(dir, 'response.txt');
    fs.writeFileSync(response, 'Test support response', 'utf8');
    const result = spawnSync(
      process.execPath,
      ['scripts/support-operations.cjs', 'resolve', ticket.id, response],
      { cwd: backend, env: process.env, encoding: 'utf8', timeout: 20000 },
    );
    assert.equal(result.status, 0, result.stderr);
    const saved = await prisma.supportTicket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    assert.equal(saved.status, 'RESOLVED');
    assert.equal(saved.response, 'Test support response');
    assert.equal(
      await prisma.notification.count({
        where: { userId: user.id, title: 'Support response' },
      }),
      1,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
test.after(async () => {
  await prisma.$disconnect();
});
