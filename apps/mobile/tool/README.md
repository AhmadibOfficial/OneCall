# OneCall UI preview

Run the real Flutter screens with sample accounts, services and bookings:

```bash
flutter run -d chrome -t tool/ui_preview.dart --web-port=8080
```

Append `?signedOut=1` to the browser URL to review welcome, sign-in and registration.
The preview is marked **SAMPLE DATA**, makes no backend calls and rejects release builds.
It is a developer entry point; the normal app still starts from `lib/main.dart`.

Review at 320px, 390px, 768px and desktop widths, including 200% text size.
The catalogue has category filters, multi-word search, favourite controls and
provider counts from the API. No availability, pricing or payment protection is inferred.

```bash
flutter analyze
flutter test
flutter build web --release --dart-define=ONECALL_API_URL=https://YOUR_API_HOST/api/v1
```

For an interactive preview served locally without a backend, use a debug web build:

```bash
flutter build web --debug --no-web-resources-cdn -t tool/ui_preview.dart
python3 -m http.server 8080 --bind 127.0.0.1 --directory build/web
```

The Flutter CI job also saves a `onecall-ui-preview` artifact for seven days.
Extract that artifact into a new directory and serve it with the command above.
It contains the sample-data preview, not a live connection to the OneCall backend.
