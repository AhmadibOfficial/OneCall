# Kaduna pilot engineering update

Repaired session/account authorization and atomic token workflows, activated Redis throttling, connected the Flutter customer app to the real API, and added Kaduna request addresses/catalogue/status tracking. Added setup instructions, a verified-provider provisioning command and native PostgreSQL/Flutter CI.

Continued with an executable Resend/Termii delivery adapter, signed request and replay validation, Redis receipts, and production HTTPS verification → booking → reset coverage. Flutter now retains saved credentials across temporary refresh outages and detaches an old account's pending refresh when switching sessions; three additional client cases cover these behaviors. Added `pnpm verify:pilot` for native PostgreSQL and Flutter acceptance, plus provider configuration and device walkthroughs.

Backend/delivery verification passed 134 tests with a disposable PostgreSQL-compatible engine, native Redis and mocked vendors. The compiled application, signed HTTPS delivery path and provider CLI passed checks. Native PostgreSQL contention, Flutter analysis/build/device tests and real provider delivery remain to be verified/configured. See `docs/PILOT-VERIFICATION.md` for the exact boundary of the completed checks.
