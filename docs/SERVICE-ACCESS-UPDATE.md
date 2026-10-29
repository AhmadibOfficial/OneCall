# Service access, Profile and parcel review — 28 October 2026

## Behaviour

New password and social registrations are ACTIVE immediately. Email verification remains optional and its real status is preserved; this change never sets emailVerified or phoneVerified to true. The additive migration activates existing nondeleted PENDING accounts only. Suspended and deleted accounts stay unavailable. Customers can book, use chat, upload private booking photos and request parcels without email verification. Providers still need operator approval and matching coverage; parcel agents and routes need their separate approvals. Customer/Provider mode is a navigation preference, not a permission grant.

The only Customer/Provider toggle is in Profile. The selected workspace stays saved per OneCall ID, and changing it does not sign out. Profile remains open after switching; use Home/Workspace or Bookings/My jobs to continue.

Appearance offers System default, Light and Dark and saves the choice on the device. System default follows OS brightness. Text-size and reduced-motion preferences remain supported in both themes. Branded panels keep their deliberate contrast.

## Special parcel-route review

Only an independent administrator may activate a proposed route. Activation requires explicit confirmation of both shops, pricing, custody arrangements and item restrictions, plus the existing review reason. The API rejects missing/false checklist confirmations; a UI-only confirmation cannot bypass it. The audit records the checklist and reviewed price, pickup fee, capacity, transit estimate and shop IDs. Both shops must remain approved with active accounts. Paused routes stop accepting new bookings; existing parcel records and custody history remain intact.

Recipient-account attachment still requires proof of phone ownership. Unverified phone numbers do not acquire access to another recipient's parcel. Sender-issued collection codes, attempt limits and assigned-shop custody checks remain enforced. Routes do not imply continuous GPS, guaranteed coverage, payment holds or provider payouts.

## Validation and release

Final application head `c3017904bc383176fc7991bc3542eb6a3aa61411` passed native PostgreSQL/Redis backend CI, Prisma migrations, TypeScript, ESLint, Flutter analysis, 58 Flutter tests, release web/debug APK builds, Docker and CodeQL. Backend suites passed 268 tests across core, booking, delivery, marketplace, admin, parcel, social/photo/privacy, operator, readiness and legal checks. Local disposable migration upgrade checks also preserved suspended/deleted restrictions and verification facts.

Local Flutter SDK startup was blocked by automatic approval review because it attempted cloud metadata access; no bypass was attempted. The repository's normal CI completed Flutter acceptance. Physical-device acceptance remains a separate check.

PR #15 merged as `9de34c0222487badf713131ce3396c9fd31687a2`. Cloud client publication uses the existing verified Render API target. It remains a debug cloud pilot, not a Play Store release. Payments and other gated integrations retain their existing activation settings.
