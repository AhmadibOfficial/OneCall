# OneCall backend

See [Kaduna pilot setup](../../docs/KADUNA-PILOT.md) and [verification results](../../docs/PILOT-VERIFICATION.md).

Run backend scripts from the workspace root with `pnpm --filter backend <script>`. `pnpm prisma:deploy` applies checked-in migrations; `pnpm build` builds the API; `pnpm --filter backend start:prod` runs the compiled application with runtime path aliases registered.

`test` contains security regression suites that create database fixtures. Set `ONECALL_ALLOW_TEST_DATABASE=true` only with a disposable database and Redis. `test:pilot` exercises the real registration, verification, booking, status, authorization and session contracts.
