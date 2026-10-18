# OneCall interface adaptation — 13 October 2026

The twelve supplied mobile screenshots guide the current pilot interface. OneCall retains its navy/blue identity and existing account, booking and provider permissions. The work is a source update, not a claim that an APK has been rebuilt or installed.

## Reference mapping

| Reference | OneCall adaptation |
| --- | --- |
| Rounded white cards on a pale background | Shared theme, grouped account panels and legal document cards |
| Dark headers and prominent rounded actions | Navy headers and blue pill-shaped buttons |
| Rounded five-tab navigation | Existing Home, Bookings, Chat, Updates and Profile destinations |
| Create-account sheet | Rounded account form, real required name/phone/email/password fields and legal links |
| Service/details/where/when/send | Guided service/details/location/timing/review flow with explicit final submission |
| Saved address and optional landmark | Existing saved-address API and address entry; landmark is included within the backend's 300-character address limit |
| Requested date/time | Seven-day selector plus date/time pickers, future-time validation and earliest availability |
| Review rows with edit controls | Editable summary; notes, address and requested time are retained when returning to earlier steps |
| Account/legal groups | Real contact verification, provider workspace, support, legal documents, logout and deletion-request entry points |

## Current feature boundaries

- Providers quote after assignment; the customer accepts the actual quote before work starts. The form does not submit a client-set price or promise competitive multi-provider offers.
- Notes are supported. Photo, video, voice and generic file attachments need booking-specific storage, access rules and backend integration before their controls are added.
- OneCall uses its own service glyphs. Photographs in the supplied screenshots are not extracted into production assets; owned/licensed service imagery can be added later.
- Verification means email/phone verification and operations approval where relevant. No face scan, background-check guarantee or automatic verification badge is invented.
- Payments and advertising remain deferred. The profile links to payment availability; inactive wallet/payment actions are removed from the main profile.
- Account deletion is a request requiring identity verification and staff handling. No 14-day recovery/deletion guarantee is added.
- Social sign-in, a global chat inbox, dark-mode switching and an offer-limit control are not advertised as functioning features. Existing per-booking chat remains available.

## Source and GitHub alignment

The app integration is based on the audited pilot, including the legal update. GitHub `develop` is older and lacks this UI/module structure; a documentation review branch does not update the running app. Reconcile the complete source with the owner's current VS Code checkout before automated deployment. No existing accounts, credentials, bookings or database schema are changed here.

## Verification

The current environment has no Flutter/Dart SDK or Android emulator. Flutter analysis, widget tests, screenshot comparison and APK build have **not** been executed here. The source includes an updated existing booking test and an additional test covering review edits without premature booking creation. Backend public-legal HTTP checks pass; they do not validate Flutter widgets.

Run on the owner's machine after applying the update:

```bash
cd "$HOME/onecall/apps/backend/onecall/apps/mobile"
flutter pub get
dart fix --apply
dart format lib test
flutter analyze
flutter test
flutter build apk --debug \
  --dart-define=ONECALL_API_URL=http://10.0.2.2:3000/api/v1
```

Review at small-screen widths and increased text size, with the keyboard open, back navigation, date-picker cancellation, invalid/long addresses and a provider unavailable in the chosen city. Check that only the final Send request creates a booking and that the real request ID/status still appear. Compile with the emulator closed on a low-memory machine, then install using the existing Android procedure.

## Follow-up: booking chat inbox

The Chat destination lists assigned bookings returned by the existing authenticated orders API, newest booking first. It opens the existing booking chat and refreshes on return. Favorites remain available from Profile and the Chat toolbar. Unassigned requests do not expose a conversation. This is a booking conversation list, not an unread-message or last-message feed. Existing backend checks continue to govern reading and sending messages, including closed bookings. No database migration is required.

Still pending: secure booking media uploads, optional social sign-in, full appearance preferences, and automated privacy request fulfilment. These require separate implementation and verification; no placeholder buttons claim they work. Payments, ads and Amboy remain deferred.
