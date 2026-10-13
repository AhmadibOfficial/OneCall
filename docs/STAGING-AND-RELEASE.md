# OneCall staging and Android release preparation

This update prepares deployment and signing. No cloud resources were created, no real messages were sent, and no release bundle was built remotely.

## Hosting draft

The root render.yaml is a free preview: API, signed delivery adapter, PostgreSQL and Redis-compatible Key Value. Photo uploads are disabled explicitly because free web services have ephemeral filesystems. Free services can sleep and free databases have lifecycle limits; use the current Render dashboard to review capacity and cost.

The separate deploy/render-paid-staging.example.yaml is an opt-in staging draft with a private API disk and paid services. It was generated with scripts/prepare-render.py --paid-staging. It is not applied automatically. Review the plans and region in Render before provisioning. Choose a region and update the privacy notice to reflect actual hosting and data transfers before public launch.

Both drafts have automatic deployment disabled, no public database/cache access and social login/payments disabled. HTTPS is supplied by Render. AUTH_DELIVERY_URL must be the delivery service's public HTTPS /challenges endpoint; the backend uses a shared generated HMAC secret. Fill Resend/Termii credentials, a verified sending domain and an approved SMS sender in Render. Private keys belong in runtime settings, never in Flutter defines or source files. Mocked adapter acceptance does not establish that messages reach real phones or inboxes.

The Docker build includes Prisma generation, backend compilation, public admin/legal assets and migration tooling. It runs as the node user. The paid draft runs migrations before deploy; the single-instance free preview migrates on startup. Migration history must be compatible with the destination database. Start with an empty staging database; preserve the laptop pilot database and do not import customer records casually.

ONECALL_UPLOAD_ROOT points both avatar and booking-photo storage to the persistent mount. Back up PostgreSQL and the photo disk together and practise restoration. The disk limits the API to one instance; do not scale filesystem storage to multiple replicas without replacing it with shared object storage. Storage checks validate configuration, not actual provider durability.

## Startup and public checks

The cloud entrypoint refuses missing/placeholder secrets, unsafe binding, an insecure verification adapter, enabled payment/social production flags and enabled uploads without an absolute persistent storage root.

From apps/backend:

```bash
ONECALL_RELEASE_ENV_FILE=/private/path/api.env node scripts/release-readiness.cjs
ONECALL_RELEASE_ENV_FILE=/private/path/delivery.env node scripts/release-readiness.cjs --delivery
node scripts/release-readiness.cjs --public-url https://YOUR_DEPLOYED_API_HOST
```

Readiness prints check names only. The public probe reads health, privacy and account-deletion pages. It sends no email/SMS, creates no account and does not claim complete legal review. A live inbox/SMS check needs your chosen test recipient and credentials.

## Booking acceptance

The backend test now covers admin assignment, a provider quote, customer acceptance, start and completion without creating a payment. On your emulator repeat that flow with your existing request: approve the provider and reviewed coverage in /admin, assign the request, sign in to the provider's OneCall account, send a quote, return to the customer to accept, then start and complete from the provider workspace. Verify both users see the same final status. This remains a human device acceptance check.

## Android release

Debug keeps the existing com.example.onecall identity. Release requires ONECALL_APPLICATION_ID to be the final owned application ID, with a private upload keystore in android/key.properties. No debug-signing fallback remains. Configure the final package and both debug/Play signing certificates in Google OAuth separately. Changing the installed application ID creates a separate app installation; do not uninstall the pilot to prepare a release.

Generate your upload keystore privately on your laptop using the Flutter signing guide. Copy android/key.properties.example to android/key.properties, fill the path/alias/passwords privately, restrict file permissions and retain an offline backup. The update never creates or overwrites your signing keys.

With the emulator closed:

```bash
cd "$HOME/onecall/apps/backend/onecall"
export JAVA_HOME="/usr/lib/jvm/java-21-openjdk-amd64"
export PATH="$JAVA_HOME/bin:$PATH"
export ONECALL_APPLICATION_ID=YOUR_FINAL_OWNED_APPLICATION_ID
export ONECALL_API_URL=https://YOUR_DEPLOYED_API_HOST/api/v1
bash scripts/build-android-release.sh
```

The script validates the URL/application ID, runs Flutter analysis and tests, and builds a signed AAB. Real signing and native builds remain unverified remotely. Before Play publication complete device testing, real message/recovery delivery, provider consent acceptance, final operator identity/retention/deletion policies, listing assets and the console's current requirements. Automated account erasure and payment protection are not claimed.

## Validation evidence

See docs/verification/release-preparation-result.json. Docker/Gradle are unavailable. The official Flutter 3.44.4 archive was downloaded and its SHA256 verified, but the Dart VM crashes with BUS_ADRERR before project execution, including on a minimal Dart smoke test. Native analysis/widgets remain blocked in this environment. The image has not been built and the Render CLI has not run; validation uses Render's published JSON schema plus backend execution on disposable PGlite and native Redis. PGlite is one connection and is not a production PostgreSQL concurrency proof.

References: https://render.com/docs/blueprint-spec, https://render.com/docs/free, https://render.com/docs/disks, https://docs.flutter.dev/deployment/android.
