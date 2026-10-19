'use strict';
require('dotenv').config({ path: '.env.production', quiet: true });
const { checks, deliveryUrl } = require('./release-readiness.cjs');
process.env.AUTH_DELIVERY_URL = deliveryUrl(process.env);
const result = checks();
if (!result.ready) {
  console.error(
    'Cloud start blocked: ' +
      result.checks
        .filter((x) => x.status !== 'ready')
        .map((x) => x.name)
        .join(', '),
  );
  process.exit(1);
}
if (process.env.ONECALL_MIGRATE_ON_START === 'true') {
  const { spawnSync } = require('node:child_process');
  const r = spawnSync('pnpm', ['prisma:deploy'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}
require('./start-production.cjs');
