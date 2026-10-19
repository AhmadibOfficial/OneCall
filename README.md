# OneCall — Nigeria services app

OneCall connects customers with approved service providers through a NestJS/PostgreSQL/Redis backend and a Flutter app. This source update follows the supplied navy-and-blue reference, adds nationwide state/town selection and connects customer and provider workflows.

Start with [the Nigeria update and native verification guide](docs/NIGERIA.md). It includes an installer for the full existing app, migration behavior, emulator instructions and live service configuration. The shared design covers every route and platform launcher.

Connected features include registration/login/verification/reset, twenty service types, area-scoped provider approval and job acceptance, quotes, booking progress, foreground location sharing, chat, saved addresses, favorites, an in-app notification inbox, support tickets and server-verified hosted checkout/wallet ledger.

The build needs native Flutter and PostgreSQL acceptance before release. Live operation across Nigeria depends on actual approved providers and configured hosted services. Automated refunds, provider payouts, push notifications, merchant inventory, routing/ETA and referral rewards remain outside this source update. Wallet funding defaults off.

Useful commands:

```bash
pnpm install --frozen-lockfile
pnpm --filter backend prisma:deploy
pnpm --filter backend build
pnpm verify:nigeria --backend-only   # disposable PostgreSQL and Redis required
pnpm verify:nigeria --flutter-only  # native Flutter, Java and Android SDK required
```

The [Kaduna guide](docs/KADUNA-PILOT.md), [authentication delivery guide](docs/AUTH-DELIVERY.md) and [earlier verification record](docs/PILOT-VERIFICATION.md) remain available for the original pilot. The new results are recorded separately in [the Nigeria verification record](docs/verification/nigeria-result.json).
