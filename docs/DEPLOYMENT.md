# OneCall cloud pilot and Android download

The source is merged through the pilot/UI PRs. Cloud activation is a separate step.
Use **My Workspace** and the **OneCall / pilot** project environment. This is a
testing deployment, with payments, ads, social production and Amboy disabled.

## Apply the cloud configuration

After the deployment update is merged to `main`, open:

https://dashboard.render.com/blueprint/new?repo=https://github.com/AhmadibOfficial/OneCall

Use the root `render.yaml`. It creates/adopts `onecall-web`, `onecall-staging-api`,
`onecall-staging-delivery`, PostgreSQL and Key Value in the OneCall project.
PostgreSQL and Key Value accept private-network connections only. App secrets are
generated in Render; connection strings and public service URLs are referenced
automatically. Do not apply the paid example as a second Blueprint.
The files are checked against Render's current published JSON schema. Render's
creation flow must still validate the actual resource and provider settings.

Enter these actual provider settings in Render's private creation form:

| Setting | Required value |
| --- | --- |
| `RESEND_API_KEY` | Your Resend API key |
| `AUTH_EMAIL_FROM` | An email address on your verified sending domain |
| `TERMII_API_KEY` | Your Termii API key |
| `TERMII_BASE_URL` | The exact HTTPS origin shown in your Termii dashboard |
| `TERMII_SENDER_ID` | Your approved 3–11 character alphanumeric sender |

The delivery process stays blocked if these are missing. No test email or SMS is
sent by deployment checks. A healthy service does not establish real delivery;
confirm receipt with your own test account before inviting customers.

The free pilot disables photo uploads because free web storage is ephemeral.
Render's free PostgreSQL expires after 30 days, and free web services can sleep.
The separate paid-storage example remains opt-in. The cloud database is new;
this process does not copy or reset the existing Kali pilot database/accounts.

## Publish the real web client and APK

Wait until the API and delivery services are live. Verify `/api/v1/health/ready`,
`/legal/privacy.html`, `/legal/account-deletion.html` and the delivery `/health`.

In GitHub Actions, run **Publish OneCall cloud client** on `main` with the actual
API URL, for example the service's returned HTTPS URL plus `/api/v1`. Alternatively,
commit `deploy/client-target.json` with that URL under `apiUrl`; the example file
is deliberately empty and does not trigger publication. Do not commit credentials.

The job rejects placeholders, local addresses, redirects and unready services.
It runs Flutter analysis/tests, builds the real web client and a signed debug
APK, verifies its signature and records SHA-256/source/API metadata. It publishes
a GitHub prerelease and updates only the `publication-onecall` branch with built
web assets and `/download/`. Manually deploy the `onecall-web` service after the
publication job succeeds; automatic Render deployments stay off.

The Android testing app is labelled **OneCall Cloud Pilot** and uses
`com.example.onecall.cloudpilot`, so it installs separately from the earlier
local pilot. Its CI test certificate is temporary; production/update signing and
Play Store publication still require a privately managed owned application ID
and upload key. No signing key is included in downloadable artifacts.

Before activation, the public web address shows a setup page. That page is not
the live application. Report the app as deployed only after the compiled client
is served, API readiness passes and a browser walkthrough succeeds.
