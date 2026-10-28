# Service access, Profile and parcel review — 28 October 2026

## Behaviour

New password and social registrations are ACTIVE immediately. Email verification remains optional and its real status is preserved; this change never sets emailVerified or phoneVerified to true. The additive migration activates existing nondeleted PENDING accounts only. Suspended and deleted accounts stay unavailable. Customers can book, use chat, upload private booking photos and request parcels without email verification. Providers still need operator approval and matching coverage; parcel agents and routes need their separate approvals. Customer/Provider mode is a navigation preference, not a permission grant.

The only Customer/Provider toggle is in Profile. The selected workspace stays saved per OneCall ID, and changing it does not sign out. Profile remains open after switching; use Home/Workspace or Bookings/My jobs to continue.

Appearance offers System default, Light and Dark and saves the choice on the device. System default follows OS brightness. Text-size and reduced-motion preferences remain supported in both themes. Branded panels keep their deliberate contrast.

## Special parcel-route review

Only an independent administrator may activate a proposed route. Activation requires explicit confirmation of both shops, pricing, custody arrangements and item restrictions, plus the existing review reason. The API rejects missing/false checklist confirmations; a UI-only confirmation cannot bypass it. The audit records the checklist and reviewed price, pickup fee, capacity, transit estimate and shop IDs. Both shops must remain approved with active accounts. Paused routes stop accepting new bookings; existing parcel records and custody history remain intact.

Recipient-account attachment still requires proof of phone ownership. Unverified phone numbers do not acquire access to another recipient's parcel. Sender-issued collection codes, attempt limits and assigned-shop custody checks remain enforced. Routes do not imply continuous GPS, guaranteed coverage, payment holds or provider payouts.

## Validation and release

Backend build, test TypeScript compilation, changed-module ESLint, Prisma schema validation and generated legal-page checks are run for this revision. Disposable SQL tests use PGlite with native Redis, not the cloud database. Native PostgreSQL contention and Prisma migrate deploy still require normal CI acceptance.

Local Flutter SDK startup was blocked by automatic approval review because it attempted to access a cloud metadata endpoint. Standalone Dart formatting succeeded, but this is not Flutter analysis, widget-test, visual or APK acceptance. The source includes updated workspace tests and tests for persisted appearance choices and OS brightness changes. Keep the PR draft and do not publish clients or deploy the backend policy until the normal Flutter and native database CI gates pass. No live accounts or bookings were changed during development.
