# P2-02b — Dedicated OneCall identity assertion issuer (source-only)

OneCall authentication for the Kaduna pilot currently exists in **draft PR #3**, not the `develop` branch. This feature is stacked on PR #3 to avoid merging its substantial unrelated changes before their separate review.

## Security boundary

OneCall's existing mobile JWT is HS256 with issuer `onecall` and audience `onecall-mobile`. It is **never** a MetaAutomate or AMBOY credential. Keep the existing mobile `JWT_SECRET` strictly separate.

This module introduces a **non-exposed** `issueDedicatedAmboyIdentityAssertion` function. It is not registered with the NestJS auth module, not reachable through any controller or external endpoint, and requires `enabled: true` plus an externally supplied Ed25519 PKCS#8 private key. No keys are committed. In-memory signing keys exist only in tests.

Before issuance, it checks a trusted, freshly loaded authoritative account snapshot against an independently authenticated `id` and `tokenVersion`: exact current version, ACTIVE, non-deleted, unlocked, email and phone verified. A production caller MUST ensure the principal came from the existing JWT guard and the loader directly queried the OneCall database. The function itself is **not an authentication middleware**.

It mints a 60-second EdDSA compact JWS with a distinct `typ=onecall-amboy-identity+jwt`, `aud=metaautomate-amboy-identity-test`, exact HTTPS issuer, product `onecall`, scope `amboy:identity-test`, canonical account UUID, unique UUIDv4 JTI, current token version, and authority `onecall-backend`. It carries no email, phone, roles, tenant ID, service permission, booking or payment data.

## Before any endpoint or service connection

A separate security PR must add a strongly authenticated **private machine-to-machine channel**, backend-only key storage/rotation, issuing operator consent and per-actor rate limits, durable issuance/denial evidence and current revocation checks. MetaAutomate must independently verify the pinned Ed25519 public key, exact claims and account session status, atomically consume JTI once with expiry, and map OneCall subjects to their *own product identity namespace* using explicitly reviewed product policy—not matching emails or client tenant IDs.

The first connected scope remains `amboy:identity-test` and MUST NOT authenticate to the MetaAutomate workspace, fetch data, submit bookings, move money, run AI models or perform other actions.

**STOP:** No OneCall PR #3 merge, cloud/Kali/Render deployment, new secrets, mobile auth change, external access or customer activation is authorized by this PR.
