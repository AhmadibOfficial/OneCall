# OneCall Google and Apple sign-in: local pilot implementation

The sign-in and registration form now shows Continue with Apple (black) and Continue with Google (outlined) above email/password. Existing password access remains available. Profile has Linked sign-in accounts. These are real provider SDK flows connected to server verification, not email-based account merging.

## Current supported scope

| Platform | Google | Apple |
| --- | --- | --- |
| Android | Native Google SDK with registered package/signing certificate | Browser flow with configured public HTTPS callback |
| iPhone/iPad | Native Google SDK with iOS client and URL scheme | Native Apple SDK with Developer configuration |
| Web/desktop | Browser flow with registered OAuth callback | Browser flow with Apple Services ID and HTTPS callback |

Default configuration is off. Production is deliberately gated pending native acceptance, provider branding, recovery and deletion/revocation review. See PENDING-UPDATE.md for encrypted refresh-token handling, signed revocation notices, unlinking and browser secrets. Google currently uses a neutral account icon; the approved branded asset remains launch work.

## Account behavior

New identities complete name and Nigerian phone onboarding. Provider identifiers, not email addresses, identify social accounts. A Google gmail/Workspace email or Apple verified email can satisfy email verification; arbitrary third-party Google email still requires OneCall verification. A new social account always needs OneCall phone verification before booking. Names do not come from untrusted provider-returned profile JSON.

If an existing password account uses the provider email, sign in with that password first, open Profile → Linked sign-in accounts, and explicitly link Google or Apple. Existing account names, email, phone, passwords, bookings, roles, verification and provider approval stay unchanged. A provider identity already attached to another account cannot be linked. Duplicate completion tickets and challenges are rejected. OneCall refresh/logout rules continue to apply. New social accounts can use the existing verified email password-reset flow to set a password; real mail delivery must be configured for recovery.

## Linked accounts and Apple lifecycle

Profile → Linked sign-in accounts lists only the signed-in user's Google/Apple links. Unlinking requires the current OneCall password, removes only the selected link, increments the account's token version and revokes existing OneCall sessions. A social-only user must first set a working password through verified recovery. This does not claim to revoke consent inside the provider's account settings.

Apple refresh credentials use authenticated encryption with a dedicated 32-byte server key. Signed Apple notifications are verified for issuer, audience, signature and event structure. Duplicate notices are ignored, and an older notice cannot remove a newer authorization. Consent revocation and Apple account-deletion notices remove the Apple link and revoke OneCall sessions; they do not automatically erase OneCall booking records.

Refresh checks run at most once per day for an active Apple-linked account. An admin-only `POST /api/v1/auth/social/apple/check-due` call checks up to 100 due accounts. A production scheduler is not deployed. Provider outages do not revoke accounts. Apple token revocation when OneCall itself deletes an account, encryption-key rotation/recovery and real-device acceptance remain launch work.

## Google local pilot configuration

1. In Google Cloud create a web OAuth client for server ID tokens and an Android client for the exact installed package (currently com.example.onecall) and its signing SHA-1. Configure the consent screen and pilot test users. Choose the final owned application ID separately before Play release.
2. Obtain the debug signing certificate using `cd apps/mobile/android && bash gradlew signingReport`. Register production signing separately; debug and Play signing certificates differ.
3. Put the web client ID in backend private configuration as `ONECALL_GOOGLE_CLIENT_ID`. Put `ONECALL_SOCIAL_LOGIN_ENABLED=true` in the local development configuration only after the migration is installed.
4. Build Android with `--dart-define=ONECALL_GOOGLE_SERVER_CLIENT_ID=<same-web-client-id>` in addition to ONECALL_API_URL. This is a public identifier, not a secret. Firebase is not required for this implementation.
5. For iOS register a separate client, configure Google's reversed client ID URL scheme in Runner/Info.plist according to the plugin guide, and add `--dart-define=ONECALL_GOOGLE_IOS_CLIENT_ID=<ios-client-id>`.

## Apple local pilot configuration

1. Register the real iOS bundle ID with Sign in with Apple enabled; use the appropriate signed provisioning profile. A paid Apple Developer membership is required. Enable the capability in Xcode and both Runner entitlements.
2. Server `ONECALL_APPLE_CLIENT_ID` must be the exact native bundle ID. Generate a valid Apple client-secret JWT using your Team ID, Key ID and downloaded private key, following Apple's documentation. Set it privately as `ONECALL_APPLE_CLIENT_SECRET`. Never put the private key or client secret in Flutter defines, GitHub, this ZIP or chat.
3. Apple authorization codes are exchanged at Apple's token endpoint; the server validates the returned ID token's signature, issuer, audience, expiry and attempt nonce. The app cannot supply the trusted account subject/email.
4. Apple private-relay email needs the registered sending domains/SPF configuration for OneCall recovery mail. Test account cancellation, first/subsequent consent, relay email and code replay on an actual signed iPhone build.
5. Android/web Apple sign-in uses the implemented browser callback. Configure an Apple Services ID as `ONECALL_APPLE_WEB_CLIENT_ID` and its corresponding client-secret JWT as `ONECALL_APPLE_WEB_CLIENT_SECRET`. Register the exact public HTTPS callback described below.
6. Set `ONECALL_APPLE_TOKEN_KEY` privately to 32 random bytes encoded as base64. Back up this key securely: changing it without migrating stored credentials makes existing encrypted Apple refresh tokens unreadable. Keep it out of Flutter builds, GitHub and this archive.
7. Register the server-to-server notification URL on the primary Sign in with Apple App ID. Test signed consent-revocation/account-deletion notifications and duplicate delivery before live activation.

## Browser callback configuration

Set backend `ONECALL_SOCIAL_PUBLIC_API_URL` to the reachable public HTTPS API base including `/api/v1`. OneCall requires HTTPS for browser callbacks, so the emulator-only or HTTP localhost API is insufficient for this flow. Register these exact addresses in the provider developer consoles:

| Purpose | Address relative to that API base |
| --- | --- |
| Google authorization callback | `/auth/social/callback/google` (GET) |
| Apple authorization callback | `/auth/social/callback/apple` (POST, form data) |
| Apple server notifications | `/auth/social/apple/notifications` (POST) |

Google browser sign-in also needs backend `ONECALL_GOOGLE_CLIENT_SECRET`; Apple browser sign-in needs the Services ID/client secret above in addition to the native Apple configuration. Server credentials never belong in Flutter defines or callback URLs. The browser flow validates the attempt state and server-verified identity, uses Google PKCE, encrypts the result and requires the original one-use proof to retrieve it. The callback response exposes no OneCall session tokens.

## Safe source installation

The installer requires the existing local pilot configuration, checks changed files, preserves unrelated edits, and backs up affected source and the running onecall-kaduna-local PostgreSQL database before applying additive migrations. It does not change .env or enable social login. Stop the backend and close the emulator first. It runs backend generation/build, RSA verification tests, public legal HTTP checks and native Flutter analysis/tests.

Migrations preserve existing accounts, credentials, provider approvals and bookings. GitHub run [38510938564](https://github.com/AhmadibOfficial/OneCall/actions/runs/38510938564) passed backend checks on native PostgreSQL/Redis, all 138 backend security tests, 36 social/photo/privacy tests, Flutter analysis, all 24 Flutter tests, web and Android debug APK builds, and the Docker build. Provider HTTPS calls are mocked. iOS builds, actual Google/Apple consent and emulator/device acceptance still need your configuration. These checks do not claim complete production concurrency or recovery testing.

## Sources

- [Google server ID-token verification](https://developers.google.com/identity/sign-in/android/backend-auth)
- [Flutter Google Android setup](https://pub.dev/packages/google_sign_in_android)
- [Flutter Google iOS setup](https://pub.dev/packages/google_sign_in_ios)
- [Flutter Google SDK API](https://pub.dev/documentation/google_sign_in/latest/)
- [Apple user verification](https://developer.apple.com/documentation/signinwithapple/verifying-a-user)
- [Flutter Sign in with Apple setup](https://pub.dev/packages/sign_in_with_apple)
- [Apple server notification setup](https://developer.apple.com/help/account/capabilities/enabling-server-to-server-notifications)
- [Apple account deletion and token revocation](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)

## Activation status

The linked-account, callback, encrypted credential and notification features are implemented in source. Social sign-in remains disabled until configured, and production activation remains gated. Complete provider registration, owned native identifiers/signing certificates, a reachable HTTPS backend, email/SMS recovery delivery, approved branding and device acceptance before enabling it for real users. Payments, ads and Amboy remain deferred.
