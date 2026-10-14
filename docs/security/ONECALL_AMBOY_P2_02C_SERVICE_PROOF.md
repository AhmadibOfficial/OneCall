# P2-02c — OneCall backend-only service proof (SOURCE ONLY)

This feature is stacked on OneCall draft PR #4, itself stacked on the unmerged authentication PR #3. It does **not** create an endpoint or service credential, and must not be merged into develop as a way to circumvent review of those prerequisites.

`mintBoundOneCallServiceProof` first runs the reviewed OneCall identity issuer with a server-authenticated principal and freshly loaded active/verified account/token-version check. It then signs a distinct Ed25519 proof using a **different private key**. The proof binds the exact assertion bytes with SHA-256 and hard-codes the recipient to `metaautomate-amboy-m2m-test`, method POST, internal identity-test path, product OneCall, scope `amboy:service-identity-test`, and 30-second expiry. No caller can request a different scope, path or audience through the function.

The two signing keys must remain server-only; neither mobile JWT_SECRET nor Flutter receives them. Tests generate ephemeral Ed25519 keys and cover key separation, blocked/revoked user, issuer failures, signature authenticity, exact assertion binding, and absence of NestJS module/controller routing.

No real service channel exists yet. Live operation requires independently authenticated private service transport (for example controlled mTLS), separate key provisioning/rotation, OneCall authenticated and authorized issuer entry point, audit/quotas, MetaAutomate trust pinning, current account/session revocation, atomic one-time proof/identity JTI consumption, deny-only tenant mapping until approved, and dual-tenant negative security tests.

No DigitalOcean deployment, new credentials, Kali migration, public Render change, customer permission, booking or model execution is approved by this source PR.
