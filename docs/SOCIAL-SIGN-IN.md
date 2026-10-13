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
5. Android Apple callback, Service ID and hosted HTTPS callback are not implemented in this increment. Do not add a browser relay that bypasses server validation.

## Safe source installation

The installer requires the existing local pilot configuration, checks changed files, preserves unrelated edits, and backs up affected source and the running onecall-kaduna-local PostgreSQL database before applying the additive migration. It does not change .env or enable social login. Stop the backend and close the emulator first. It runs backend generation/build, RSA verification tests, public legal HTTP checks and native Flutter analysis/tests. Flutter 3.44.4 analysis and all 24 tests now pass remotely; Android/iOS builds, real provider consent and emulator acceptance still need your device configuration.

SocialIdentity and SocialAuthChallenge are new tables. No existing account/order columns are rewritten. Native PostgreSQL concurrency and actual Google/Apple consent were not verified remotely. Backend evidence uses disposable PGlite (one connection), native Redis, real HTTP/RSA and mocked provider HTTPS calls.

## Sources

- [Google server ID-token verification](https://developers.google.com/identity/sign-in/android/backend-auth)
- [Flutter Google Android setup](https://pub.dev/packages/google_sign_in_android)
- [Flutter Google iOS setup](https://pub.dev/packages/google_sign_in_ios)
- [Flutter Google SDK API](https://pub.dev/documentation/google_sign_in/latest/)
- [Apple user verification](https://developer.apple.com/documentation/signinwithapple/verifying-a-user)
- [Flutter Sign in with Apple setup](https://pub.dev/packages/sign_in_with_apple)

## Remaining-feature update

The newer implementation supersedes the platform table and lifecycle/unlink gaps above: browser flows, Apple encrypted refresh/notification handling and password-confirmed unlink are now in source. See PENDING-UPDATE.md for configuration and remaining launch requirements. Production remains gated; no real provider acceptance is claimed.
