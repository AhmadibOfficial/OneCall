# OneCall cloud, payments and account workspaces

The Customer/Provider switch keeps the same signed-in account. It saves a device
preference per OneCall ID and opens the corresponding bookings and chat. It
does not grant approval. Unverified users still verify their contacts; new
providers apply and await operations review. Customer bookings remain available
after switching back. Parcel agent approval remains separate.

## Cloud activation

On 23 October 2026 **My Workspace** contained the static `onecall-web` frontend
but no OneCall API, PostgreSQL or Key Value. Source and APK builds do not
establish live cloud availability.

Use the [Blueprint creation form](https://dashboard.render.com/blueprint/new?repo=https://github.com/AhmadibOfficial/OneCall),
branch `main`, root `render.yaml`, in **My Workspace**. Associate existing
`onecall-web`; do not create a duplicate or change MetaAutomate or the portfolio.
The source of truth is the Blueprint's **OneCall / pilot** environment:

| Resource | Purpose |
| --- | --- |
| `onecall-staging-api` | Production-mode account, booking and payment API |
| `onecall-staging-delivery` | Signed email verification delivery |
| `onecall-staging-db` | PostgreSQL 16 with external access blocked |
| `onecall-staging-cache` | Redis-compatible Key Value with external access blocked |
| `onecall-web` | Existing static client on `publication-onecall` |

The free configuration is temporary: PostgreSQL expires after 30 days, Key Value
loses memory on restart and web services sleep when idle. It is unsuitable for
public financial operations or the only copy of customer data. The paid-storage
example is a reviewable draft, not permission to purchase hosting or create a
second Blueprint. Confirm durable hosting and recovery before real payments.
Do not copy customer data into an expiring pilot without a recovery plan.

## Private provider inputs

Enter actual provider-issued settings directly in Render, never in source/chat:

| Service | Setting | Value |
| --- | --- | --- |
| delivery | `RESEND_API_KEY` | Actual Resend key |
| delivery | `AUTH_EMAIL_FROM` | Email address on a domain verified in Resend |
| API | `ONECALL_PAYMENT_MODE` | `test` for sandbox, or `disabled` to defer |
| API | `PAYSTACK_SECRET_KEY` | Matching test secret, or empty when disabled |
| API | `ONECALL_PAYMENTS_LIVE_APPROVED` | `false` during setup and testing |

The final three use `sync: false`: initial creation prompts for them; later
Blueprint syncs preserve their privately configured values. For an existing
service edit **Environment** and redeploy. A secret key alone never enables
payments. Render generates OneCall session/delivery secrets and wires private
connections. The production checks remain mandatory; missing delivery settings
block startup. Placeholders and development-mode verification bypasses are not
substitutes. Confirm actual email receipt on your own test account.

## Payment testing and live activation

1. Start with `ONECALL_PAYMENT_MODE=test`, a matching `sk_test_…` key and
   `ONECALL_WALLET_ENABLED=false`. Secret keys never belong in the APK.
2. The API derives its HTTPS return URL from its actual `RENDER_EXTERNAL_URL`
   and `API_PREFIX`. Override `PAYSTACK_CALLBACK_URL` only for your verified
   custom API domain, ending `/api/v1/payments/paystack/return`.
3. Configure the actual test webhook in Paystack's test dashboard:
   `https://<your-actual-api-host>/api/v1/payments/paystack/webhook`.
4. Accept a provider quote on a test booking. Check availability under
   **Profile → Payments & checkout**, then use that booking's test checkout.
   Use Paystack test instruments. Return to OneCall and select **Check payment
   status**. A return page alone never confirms or settles a payment.
5. Check quote amount, NGN currency, owner, reference, test/live domain,
   raw-body webhook signature and duplicate protection.
6. Before live collection, complete Paystack business activation and publish
   operator identity, fees, provider settlement, refunds and dispute procedures.
   Verify durable hosting/backups and a separate intended production dataset.
7. Following that operational review, configure a matching live key,
   `ONECALL_PAYMENT_MODE=live`, `ONECALL_PAYMENTS_LIVE_APPROVED=true` and the live
   webhook. Redeploy and perform an authorised controlled transaction. Setting
   flags alone is not evidence of provider approval or completed acceptance.

Checkout intents and payments record their provider mode. Pending checkouts
cannot settle under another mode; older pending records with unknown mode
require reconciliation. Do not delete pending records to retry a payment:
the processor might already have charged. Changing keys does not convert test
payments into real money or make an existing test booking unpaid. Keep sandbox
and live datasets separate.

Live wallet funding/spending, automatic provider payouts, escrow, protected
holds and automated refunds are not implemented. The live gate rejects wallet
activation. Checkout pays an accepted service-booking quote; separate parcel
checkout is not added. Quotes and delivered statuses do not prove payment.

## Preserve accounts and publish clients

Back up existing Kali source and PostgreSQL before a controlled import. A new
cloud database is empty; existing accounts/bookings are not copied automatically.
Never reset the local database or delete Docker volumes. Apply
`pnpm --filter backend prisma:deploy` to the intended database. The new migration
adds payment-mode columns and retains existing records.

Check API `/api/v1/health/ready`, public privacy/deletion pages, delivery
`/health`, and actual email receipt. Run **Publish OneCall cloud client**
with that API's real HTTPS URL ending `/api/v1`, or commit the URL under `apiUrl`
in `deploy/client-target.json`. Deploy `onecall-web` after the publication branch
updates. The workflow rejects local, placeholder and unready APIs.

Test the resulting **OneCall Cloud Pilot** APK with USB disconnected on both
Wi-Fi and cellular: login, verification, bookings, workspace switching, approval
restrictions, chat, test checkout and reconciliation. **OneCall Phone Pilot** is
a different USB/local-backend app; updating it alone cannot provide independent
Internet access. Ads and Amboy remain deferred; social login needs its credentials.

References: [Render free limits](https://render.com/docs/free),
[Render environment variables](https://render.com/docs/configure-environment-variables),
[Paystack checkout](https://paystack.com/docs/payments/accept-payments/),
[Paystack verification](https://paystack.com/docs/payments/verify-payments/).

## Email-only account verification

An active account needs a verified email to book, upload booking photos or apply
for provider/parcel-agent access. Provider and agent approval remain separate
operator decisions. Phone numbers remain contact details, not verified identity.
Existing phone verification records are preserved; no phone is marked verified
by this change. SMS is disabled by default (`ONECALL_SMS_ENABLED=false`). Termii
credentials are not needed for this deployment. Legacy SMS delivery requires an
explicit opt-in and valid Termii configuration; it is not a booking prerequisite.

For initial Paystack testing set `ONECALL_PAYMENT_MODE=test` and
`ONECALL_PAYMENTS_LIVE_APPROVED=false` on the API, with a real matching test
secret key stored privately. Never substitute a placeholder key. This does not
enable real charges, provider payouts or refunds.
