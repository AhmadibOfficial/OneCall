# OneCall provider approval and booking operations

Open http://127.0.0.1:3000/admin/ with the existing locally granted ADMIN account, using email and password. The admin APIs check current database roles, and mutations recheck account/role availability within their transaction. Provider/customer identity never grants admin access. Tokens remain only in browser memory. Payment availability follows the deployment configuration. Email verification is optional for service access; provider approval and reviewed coverage remain mandatory.

## Provider operations

Search by provider UID, email or name. Review verification flags, account status and coverage. Select the state, town and one or more service keys, then provide a reviewed reason. First approval replaces proposed coverage with the reviewed area. Later approvals add coverage without duplicates. A town of * explicitly grants the whole state; use it only for a provider who can serve the whole state. The app records actor, reason and coverage and notifies the provider.

Revocation disables provider availability and new assignments. Active ACCEPTED/IN_PROGRESS bookings block revocation so operations must resolve those jobs first. Existing booking/provider rows are retained. This is coverage approval, not account suspension. Individual coverage removal is not in this revision.

## Booking operations

Search by request ID, customer UID, service or town; filter by status; page through 25 results at a time. Inspect the booking's addresses, description, schedule, provider and quote acceptance state. Admin operations history records new admin assignments/cancellations and their actor/reason, including prior/new status. Earlier customer/provider transitions are not reconstructed.

Only unassigned PENDING requests can be assigned. The eligible provider list is limited to 100 approved, active providers matching the booking's exact service/state/town or a reviewed state-wide area. A provider cannot fulfil their own customer request. The server rechecks eligibility and the pending state under locks; concurrent admin/provider acceptance produces one winner. Assignment changes the request to ACCEPTED, notifies the customer/provider and leaves provider quotation and customer quote acceptance in place. Admin cannot mark work started or completed or supply prices.

Cancellation requires a 3–500 character reason and an active booking. Pending/succeeded payments or unresolved/succeeded checkouts block cancellation. Completed/cancelled requests cannot be cancelled again. Successful cancellation clears the location, records history and notifies the parties. Terminal chat restrictions remain in the customer/provider API.

## Update

Stop the local backend before applying the patch. The archive includes a guarded apply-admin-update.sh helper. It validates the local pilot and archive, backs up backend source and PostgreSQL data, overlays only the admin/backend files, deploys the additive AdminOperation migration, generates Prisma and builds. It does not overwrite .env, Flutter or runtime data, grant new roles, start services, enable payments, reset databases or drop existing tables. Backup failure stops before overlay; migration/build failure stops and reports the backup location. Do not restore a database backup over subsequent live writes without a reviewed recovery process.

Run test:admin only on a disposable test database with ONECALL_ALLOW_TEST_DATABASE=true. The normal pilot backend verification now includes that suite. No credentials or customer data are supplied by this archive. The corrected local role-grant helper is included; it does not write the unsupported security-event enum.

## Verification and remaining acceptance

See verification/admin-operations-result.json. Eleven real HTTP/database admin operations tests plus 38 selected regression/unit checks passed (49 total). Tests use disposable PGlite with Prisma pool size one and native Redis; multi-connection native PostgreSQL contention remains a local verification step. The fresh migration and an upgrade with existing account/provider/request fixtures passed. Nest build, TypeScript, ESLint, schema and JavaScript checks passed. Five installer checks passed against the actual packaged archive with stub database/build commands, including preservation of local Flutter files and .env. Browser rendering and operator acceptance remain local steps.

Use Providers to approve matching coverage for the existing test provider. Find your customer's existing request in Bookings, inspect it and assign the eligible provider if it is still pending. Log in as provider on mobile and quote; log in as customer and accept the quote; provider starts/completes the job normally. Do not cancel the request you intend to fulfil. Support responses remain available. Account administration, a service editor and finer delegated admin roles are separate future work.
