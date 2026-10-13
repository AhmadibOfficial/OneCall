# OneCall remaining pilot features — 13 October 2026

This cumulative update includes the preceding Google/Apple sign-in and Chat inbox source. Payments, advertising rewards and Amboy remain deferred.

## Implemented

- Profile lists linked Google/Apple accounts. Unlink requires the current working OneCall password, removes only that link and revokes OneCall sessions. Social-only users must set a password through verified recovery first. Unlinking OneCall is not a promise to delete a Google/Apple account or revoke every provider-side consent.
- Optional browser Google/Apple sign-in for web/desktop and Apple on Android: HTTPS callback, Google PKCE, short-lived attempts, encrypted results, one-use retrieval and explicit account linking. Provider credentials never belong in app builds or callback URLs.
- Apple refresh credentials are encrypted under a dedicated 32-byte key. Signed consent-revoked/account-deletion notices remove the Apple link and revoke sessions. Active-account refresh checks run at most once per day. The administrator check-due endpoint can process 100 due accounts; a production scheduler is not deployed. Provider outages do not revoke accounts. Recovery, provider-side revocation on account deletion, key rotation and real-device acceptance remain launch work.
- Booking participants can upload up to six JPEG/PNG photos, each at most 5 MB with bounded dimensions. Closed bookings reject new photos. Authenticated private reads, random storage keys and quota checks protect access. Images may retain original metadata. Private photo storage must be backed up and persisted when deploying.
- Text-size and reduced-motion preferences preserve device accessibility scaling. No dark theme is added.
- Profile privacy requests create owner-visible support tickets for access, correction or deletion. Password confirmation unlocks a basic account snapshot. A support response is not proof of completed erasure; full access/retention/deletion review remains an operator process.

## Configuration

Default sign-in flags remain off, and production social sign-in is deliberately gated. Keep existing email/password access.

Native Google uses backend ONECALL_GOOGLE_CLIENT_ID and Flutter public ONECALL_GOOGLE_SERVER_CLIENT_ID; configure Android package/signing SHA and iOS URL scheme separately. Native Apple needs ONECALL_APPLE_CLIENT_ID, ONECALL_APPLE_CLIENT_SECRET and ONECALL_APPLE_TOKEN_KEY (32 random bytes, base64; keep outside source control and preserve for decrypting stored credentials).

Browser flows additionally need ONECALL_SOCIAL_PUBLIC_API_URL (public HTTPS API base including /api/v1), ONECALL_GOOGLE_CLIENT_SECRET, and for Apple ONECALL_APPLE_WEB_CLIENT_ID/ONECALL_APPLE_WEB_CLIENT_SECRET. Register exact callbacks /auth/social/callback/google and /auth/social/callback/apple beneath that base. Configure Apple notifications at /auth/social/apple/notifications. These addresses require a reachable HTTPS backend; the emulator-only API cannot receive provider callbacks. No keys or hosting were configured by this update.

## Installation

Stop the backend and close the emulator. Reuse the established onecall-kaduna-local Docker project. Extract scripts/apply-social-update.py from onecall-pending-update.zip into a temporary file and run it with the ZIP path. It validates the existing local configuration, backs up affected source and PostgreSQL before writes, refuses unknown custom logic, applies additive migrations, builds the backend and runs native Flutter checks. It never replaces private environment files.

The source backup does not include pre-existing private photo binaries; preserve apps/backend/storage separately. Use the reported backup if verification stops. No database reset or force-push is required.

After checks pass, build with the emulator closed:

```bash
export JAVA_HOME="/usr/lib/jvm/java-21-openjdk-amd64"
export PATH="$JAVA_HOME/bin:$PATH"
cd "$HOME/onecall/apps/backend/onecall/apps/mobile"
flutter build apk --debug --dart-define=ONECALL_API_URL=http://10.0.2.2:3000/api/v1
```

Then start your existing backend and emulator and run scripts/run-android.sh emulator-5554 from the workspace root.

## Validation limits

Backend build, targeted lint, disposable-database HTTP tests, RSA/crypto tests, authentication regression and additive migration preservation are checked remotely. Vendor HTTPS calls are mocked. PGlite uses one connection and is not production PostgreSQL concurrency proof. Flutter/Dart SDKs are unavailable remotely: source formatting parses syntax, but analyzer, widgets, Android/iOS builds and real provider consent remain required on your laptop. The installer runs Flutter analysis and tests before reporting success. This is a pilot source update, not a Play Store or cloud release.

## Staging and signing preparation increment

The cumulative update now also includes Render hosting drafts, private persistent upload paths, verification-delivery readiness checks, a complete booking HTTP test and Android upload-key signing guards. Read STAGING-AND-RELEASE.md before using them. Hosting, real provider credentials, native acceptance and public launch are still not completed by installing source.
