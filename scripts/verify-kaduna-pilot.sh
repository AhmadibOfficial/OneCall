#!/usr/bin/env bash
set -euo pipefail

task_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$task_root"
mode="${1:---all}"
case "$mode" in
  --all|--backend-only|--flutter-only) ;;
  --help)
    cat <<'HELP'
Usage: pnpm verify:pilot [--all|--backend-only|--flutter-only]

Backend requires ONECALL_TEST_DATABASE_URL and ONECALL_TEST_REDIS_URL pointing
to disposable local services. The PostgreSQL database name must include _test.
Flutter requires the SDK on PATH. Android builds also require Java and Android SDK.
Set ONECALL_API_URL to your HTTPS API for usable builds; the default example URL
only checks compilation. No deployment or real email/SMS sending is performed.
HELP
    exit 0 ;;
  *) echo 'Unknown mode; run pnpm verify:pilot --help' >&2; exit 2 ;;
esac

# Clear any earlier success before checking prerequisites, including an absent SDK.
mkdir -p .pilot-verification
task_log="$task_root/.pilot-verification/verification.log"
task_result="$task_root/.pilot-verification/result.json"
: > "$task_log"
printf '{"passed":false,"status":"preflight incomplete","mode":"%s"}\n' "$mode" > "$task_result"
export ONECALL_VERIFY_NATIVE_PASSED=false

command -v node >/dev/null
command -v pnpm >/dev/null
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Use Node 24 or newer")'
if [[ "$mode" != '--backend-only' ]]; then
  command -v flutter >/dev/null || { echo 'Flutter SDK is missing from PATH.' >&2; exit 1; }
  command -v java >/dev/null || { echo 'Java is required for the Android APK check.' >&2; exit 1; }
fi
if [[ "$mode" != '--flutter-only' ]]; then
  command -v openssl >/dev/null || { echo 'OpenSSL is required for the local HTTPS delivery test.' >&2; exit 1; }
  : "${ONECALL_TEST_DATABASE_URL:?Set ONECALL_TEST_DATABASE_URL to a disposable local PostgreSQL _test database}"
  : "${ONECALL_TEST_REDIS_URL:?Set ONECALL_TEST_REDIS_URL to a disposable local Redis instance}"
  export DATABASE_URL="$ONECALL_TEST_DATABASE_URL"
  export REDIS_URL="$ONECALL_TEST_REDIS_URL"
  export REDIS_TEST_URL="$ONECALL_TEST_REDIS_URL"
  export DATABASE_POOL_SIZE=10 NODE_ENV=test ONECALL_ALLOW_TEST_DATABASE=true
  export APP_NAME=OneCall APP_VERSION=0.1.0 API_PREFIX=api/v1 TRUST_PROXY=0
  export JWT_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  export JWT_REFRESH_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  export PAYMENT_WEBHOOK_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  # Tests inject only local/mocked delivery; inherited vendor settings are excluded.
  export AUTH_DELIVERY_URL='' AUTH_DELIVERY_SECRET='' PAYSTACK_SECRET_KEY='' ONECALL_WALLET_ENABLED=false
fi

task_api_url="${ONECALL_API_URL:-https://api.example.com/api/v1}"
ONECALL_VERIFY_API_URL="$task_api_url" node <<'JS'
const u = new URL(process.env.ONECALL_VERIFY_API_URL);
if (u.protocol !== 'https:' || !u.hostname || u.username || u.password || u.search || u.hash) {
  throw new Error('Use an HTTPS ONECALL_API_URL without credentials, query or fragment');
}
JS

export ONECALL_VERIFY_RESULT="$task_result" ONECALL_VERIFY_MODE="$mode"
finish() {
  task_exit=$?
  ONECALL_VERIFY_EXIT="$task_exit" node <<'JS'
const fs = require('node:fs');
fs.writeFileSync(process.env.ONECALL_VERIFY_RESULT, JSON.stringify({
  completedAt: new Date().toISOString(), mode: process.env.ONECALL_VERIFY_MODE,
  passed: process.env.ONECALL_VERIFY_EXIT === '0',
  database: process.env.ONECALL_VERIFY_MODE === '--flutter-only' ? 'not checked' : 'native PostgreSQL requested, 10 Prisma connections',
  nativeConnectionPreflightPassed: process.env.ONECALL_VERIFY_NATIVE_PASSED === 'true',
  deviceAcceptance: 'pending manual device checks', liveVendorDelivery: 'not attempted',
}, null, 2));
JS
  if [[ "$task_exit" == 0 ]]; then
    echo 'Verification passed. Results: .pilot-verification/result.json'
  else
    echo 'Verification failed. See .pilot-verification/verification.log' >&2
  fi
}
trap finish EXIT
check() {
  printf '\nRunning:' | tee -a "$task_log"
  printf ' %q' "$@" | tee -a "$task_log"
  printf '\n' | tee -a "$task_log"
  "$@" 2>&1 | tee -a "$task_log"
}
if [[ "$mode" != '--flutter-only' ]]; then
  check pnpm install --frozen-lockfile
  check node apps/backend/scripts/verify-native-services.cjs
  export ONECALL_VERIFY_NATIVE_PASSED=true
  check pnpm --filter backend prisma:validate
  check pnpm --filter backend prisma:deploy
  check python3 scripts/generate-legal-pages.py --check
  check pnpm --filter backend build
  check pnpm --filter backend test:legal
  check pnpm --filter backend exec tsc --project test/tsconfig.json --noEmit
  check pnpm --filter backend lint:pilot
  check pnpm --filter backend lint:delivery
  check pnpm --filter backend lint:nigeria
  check pnpm --filter backend test --runInBand --silent
  check pnpm --filter backend test:pilot
  check pnpm --filter backend test:nigeria
  check pnpm --filter backend test:admin
  check pnpm --filter backend test:social
  check pnpm --filter backend test:delivery
  check pnpm --filter backend test:operations
fi
if [[ "$mode" != '--backend-only' ]]; then
  cd -- "$task_root/apps/mobile"
  check flutter --version
  check flutter pub get
  check flutter analyze
  check flutter test
  check flutter build web --release "--dart-define=ONECALL_API_URL=$task_api_url"
  check flutter build apk --debug "--dart-define=ONECALL_API_URL=$task_api_url"
fi
