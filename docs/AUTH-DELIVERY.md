# Authentication email and SMS delivery

The supplied adapter implements the backend's signed delivery contract with Resend for email and Termii for SMS. It is a separate Node 24 process using the backend's installed dependencies. Credentials and sending-domain/sender approvals are operator configuration. This source update did not deploy the adapter or send a real message.

## Configure and start

From the repository root, after `pnpm install --frozen-lockfile`:

```bash
cp apps/backend/config/auth-delivery.env.example apps/backend/.env.delivery
```

Fill the copied file outside version control:

| Setting | Required value |
| --- | --- |
| `AUTH_DELIVERY_SECRET` | Fresh random shared secret of at least 32 characters, identical to the backend setting |
| `AUTH_DELIVERY_REDIS_URL` | Persistent Redis used for delivery receipts; use TLS for remote access |
| `AUTH_DELIVERY_REDIS_PREFIX` | Unique stable namespace for this deployment; keep it across restarts and replicas |
| `RESEND_API_KEY` | Server-side Resend sending API key |
| `AUTH_EMAIL_FROM` | Email address on a domain verified in Resend |
| `TERMII_API_KEY` | Server-side Termii API key |
| `TERMII_BASE_URL` | Exact HTTPS origin from the Termii account dashboard, for example `https://api.ng.termii.com` |
| `TERMII_SENDER_ID` | Approved 3–11 character alphanumeric SMS sender |

The adapter uses Termii's DND route for verification codes. Email contains the full `selector.secret` token used by the current app/API. SMS contains the six-digit code. Password-reset emails contain the backend reset token; a Flutter reset screen remains separate work.

Start it with:

```bash
pnpm --filter backend auth:delivery
```

The default listener is `127.0.0.1:3010`. `AUTH_DELIVERY_ENV_FILE` can select a different private configuration file. A process manager can instead supply the environment directly. Missing credentials or an unreachable Redis store prevent startup. `GET /health` checks Redis; it does not claim that provider credentials, balance, sender approval or recipient delivery have been verified.

Expose the listener through the deployment's HTTPS reverse proxy. For example, with an operator-controlled hostname and Caddy:

```caddyfile
delivery.example.com {
    reverse_proxy 127.0.0.1:3010
}
```

Use your actual hostname and valid TLS certificate, then set the backend:

```dotenv
NODE_ENV=production
AUTH_DELIVERY_URL=https://delivery.example.com/challenges
AUTH_DELIVERY_SECRET=<the same random shared secret>
```

Restart the backend after configuration changes. Keep the adapter listener behind the proxy. Provider keys belong only in the adapter environment, never in Flutter. The backend requires HTTPS and rejects redirects; the adapter's vendor requests also reject redirects and time out after seven seconds.

## Request and receipt behavior

Only a signed JSON POST to `/challenges` can send a message. The adapter verifies HMAC-SHA256 against the exact body bytes, allows timestamps up to five minutes old and 30 seconds ahead, validates challenge fields/expiry, and limits the body to 8 KiB. Success returns an empty 204 response after the vendor has accepted the request. Provider rejection, uncertainty or unavailable Redis returns 503 without echoing the message, credentials or vendor response.

Redis atomically claims `kind + selector` before any vendor call. Matching completed requests return 204 without sending again. A changed payload under the same selector returns 409. Concurrent or uncertain requests return 503. Resend also receives a deterministic provider idempotency key.

If a vendor call times out or the process stops during a send, the receipt remains pending. The adapter deliberately does not resend that selector because SMS acceptance may be unknown. The customer can request a new challenge through the backend, which generates a fresh selector and invalidates previous challenges. Receipts contain hashes/state, not the message or recipient, and expire 24 hours after challenge expiry.

Keep receipts durable and avoid Redis eviction of delivery keys. A lost receipt store can allow a duplicate SMS; this implementation does not claim delivery exactly once across lost Redis state. The local Compose Redis uses persistence, but production retention and replication require deployment configuration. Provider API acceptance is also distinct from arrival in the customer's inbox or phone; confirm actual arrival during pilot acceptance.

## Verification

After building the backend, against disposable PostgreSQL/Redis with `ONECALL_ALLOW_TEST_DATABASE=true` and `REDIS_TEST_URL` set:

```bash
pnpm --filter backend lint:delivery
pnpm --filter backend test:delivery
```

The 17 delivery checks use real Express HTTP, native Redis, and a per-run local HTTPS certificate, with mocked vendor calls. The compiled production backend generates the signed payload, sends it over verified TLS to the adapter, confirms email/phone, creates/reads a Kaduna request, and resets the password with stale-session rejection. OpenSSL is required for the local HTTPS test; certificate validation is never disabled. No real provider calls are made by these tests.

The API schemas were checked against primary documentation: [Resend send email](https://resend.com/docs/api-reference/emails/send-email), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Termii account base URL](https://developer.termii.com/) and [Termii SMS messaging](https://developers.termii.com/messaging-api). Recheck provider settings when configuring a live account.
