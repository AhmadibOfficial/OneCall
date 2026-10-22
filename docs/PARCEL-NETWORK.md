# OneCall parcel network pilot

This adds a motor-park / shop-to-shop parcel service inside the existing **Parcel Delivery** category. It uses OneCall's own shops, routes, branding and account permissions. It does not connect to Zeta, copy its network, or claim that Zeta agents work for OneCall.

## Customer flow

1. Sign in and verify email and Nigerian phone.
2. Open **Parcel Delivery**. Search approved origin routes by state/city and destination state.
3. Review the actual shops, addresses, price, weight limit and estimated transit time. Choose shop drop-off or home pickup when the route offers it.
4. Declare recipient, contents, weight and packaging. Confirm permitted items and the quote, then send the request.
5. Wait for the origin shop to accept. Follow custody history under **Bookings → Parcel delivery & tracking**.
6. When ready for collection, the sender creates a six-digit code and shares it privately with the recipient. The destination shop verifies the code before recording handover. An existing verified recipient account matching the phone at booking can view its parcel but cannot issue a code. Later ownership of a phone number does not grant access to old parcels. A recipient without an account at booking can collect using the sender-provided code; in-app access for a later account requires Support.

A lost response can be retried from the same booking form using its original idempotency reference. Check **My parcels** before starting another form. Changing an already accepted reference's contents is rejected. The basic password-confirmed account snapshot now includes the sender's parcel records without code hashes.

## Agent and administrator flow

- **Profile → Parcel agent workspace** accepts shop applications. This is separate from ordinary provider approval.
- An authorised administrator opens **/admin → Parcel network**, checks identity, the real physical shop and custody arrangements offline, and records an evidence reference and reason. This flow does not collect NIN documents or perform an automatic identity check. An administrator cannot approve their own shop or route.
- An approved origin shop proposes a route to another approved shop. Administrators activate or pause routes. There are no sample or automatically approved routes in production.
- Agent jobs permit only the assigned shop to record its relevant handovers: acceptance, origin receipt, departure, destination arrival and code-confirmed collection. There is no administrator shortcut for code-confirmed delivery.
- Prices are integer kobo. The server checks the displayed quote and snapshots the price at booking. Capacity and route availability are checked again at submission.
- Sender cancellation is allowed before custody. After custody the sender can request a return. Destination departure, origin receipt and a separate sender return code complete that process.
- Suspension removes a shop's new route availability and custody permissions; it does not erase parcels. Resolve a suspended shop's existing custody through Support before reinstatement. Reassignment to a third shop is not implemented.
- A participant can open a linked parcel support request. Operators respond in the existing Support workspace. Private admin parcel views require a reason and produce an audit entry.

## Boundaries

- Tracking is an agent-recorded custody timeline, **not continuous GPS** or proof that an unrecorded transport event occurred.
- No online collection, escrow, refund ledger, insurance or agent wallet payout is activated. A quote or DELIVERED status is not proof of payment. Payments, advertising and Amboy remain deferred.
- Collection codes are shown once to the sender, not stored on the phone or exposed in list/detail/admin responses. They expire after 24 hours, lock after five wrong submissions, and can be replaced at most three times per collection stage in a 24-hour issue window. Replacement invalidates the old code. No automatic SMS of parcel codes is implemented; the sender shares them privately.
- Account notifications remain available for existing services. Parcel updates require refresh; push notifications and live chat for the new parcel model are not added.
- Limits: 20 new shipments per sender per rolling day; 100 proposed routes per origin shop; list pages contain at most 50 shipments. Shop/route directories and admin overviews show up to 100 records; filter by state/city or use Support as the network grows. Photo evidence for this separate parcel model is not implemented; legacy booking photos remain private and unchanged.
- Published legal notices remain pilot drafts. Confirm the operator identity, support procedures, retention schedule and transport responsibilities before public operation. Run real two-shop acceptance tests before carrying customer goods.

## Wi-Fi and cellular activation

The existing **OneCall Phone Pilot** APK points to `http://127.0.0.1:3000/api/v1`. It requires the computer's backend and USB reverse port mapping. `10.0.2.2` is the emulator's host address. Neither is an Internet service, and adding Android permissions cannot make these addresses public. Android INTERNET permission already exists.

As checked on 22 October 2026, the selected Render workspace has `onecall-web`, a static site, but no OneCall API, PostgreSQL or Key Value instance. A static site alone cannot serve the database-backed Android API.

1. Complete the existing `render.yaml` Blueprint for OneCall's API, delivery adapter, PostgreSQL and Key Value. Keep production readiness checks enabled. See [DEPLOYMENT.md](DEPLOYMENT.md).
2. Configure actual `RESEND_API_KEY`, verified-domain `AUTH_EMAIL_FROM`, `TERMII_API_KEY`, provider-supplied HTTPS `TERMII_BASE_URL` and approved `TERMII_SENDER_ID` privately in Render. Use provider-issued values with the correct formats, never placeholders. This step cannot be completed with invented placeholders or a development verification bypass.
3. Back up existing local source/database. A newly created cloud database does **not** contain the laptop's accounts or bookings. Decide and carry out a controlled import separately before switching users; do not reset the existing database or delete Docker volumes.
4. Apply migrations with `pnpm --filter backend prisma:deploy`; this migration adds separate parcel tables and retains existing accounts/orders. Verify API `/api/v1/health/ready` plus public legal pages and real email/SMS verification delivery.
5. Run the existing **Cloud client publication** workflow with the real HTTPS API URL ending `/api/v1`. It preflights the endpoint before building/publishing the separate cloud APK and web client. Never substitute the static web URL for an API or publish a localhost APK as a cloud release.
6. Test the cloud APK on a phone with USB disconnected, once on Wi-Fi and once on cellular. Verify login, account verification, an existing service request, approved parcel route booking, both agent handovers, collection, returns and Support. Inspect logs without recording passwords, codes or personal documents.

Free Render resources are for a pilot, not a promise of always-on nationwide service. Check current plan restrictions, expiry, storage and backups before public launch. No paid upgrade is authorised by these instructions.

## Verification

`pnpm --filter backend test:parcels` runs real HTTP tests against a disposable PostgreSQL/Redis database. Set `ONECALL_ALLOW_TEST_DATABASE=true`; do not run fixture suites against user data. CI runs this alongside the existing backend suites, Flutter analysis/tests/web/APK builds and Docker build. `pnpm --filter backend lint:parcels` checks the new backend code. `flutter test test/parcel_test.dart` checks route availability, booking retry identity, recipient permissions, large text and pending-shop controls.

Verification includes 16 parcel HTTP/database tests and seven Flutter parcel tests. The parcel backend has passed CI against real PostgreSQL and Redis, alongside the existing backend suites and Docker build. See the PR checks for the final source revision and Android/web build results. No physical phone runtime, cloud migration or live provider-delivery test is implied by a successful build.
