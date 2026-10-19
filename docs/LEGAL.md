# OneCall legal and privacy implementation

Revision: 13 October 2026. Status: pilot draft, not a claim of legal approval or full regulatory compliance.

Repository alignment: these integration instructions describe the audited pilot source. The GitHub `develop` branch inspected on this date is older and does not contain its `lib/ui` screens or application bootstrap. The legal-document review pull request is limited to documentation and generation; merging it does not install these entry points. Apply the integration patch to the current pilot source, then reconcile the source histories before enabling automated deployment.

The supplied marketplace text has been adapted to OneCall's actual implementation. It must be reviewed by a qualified Nigerian legal/privacy professional before public launch, with the operator's legal identity, address, vendor locations and retention periods confirmed. This work does not enable payments, advertising rewards or Amboy, or delete any existing accounts or bookings.

## Documents and locations

| Document | Public backend path | Flutter location |
| --- | --- | --- |
| All documents | `/legal/` | Registration/sign-in and Profile → Legal & privacy |
| Privacy policy | `/legal/privacy.html` | Settings & Information → Privacy Policy |
| Terms of service | `/legal/terms.html` | Settings & Information → Terms of Service |
| Payment availability | `/legal/payments.html` | Settings & Information → Payment availability |
| Consumer protection | `/legal/consumer.html` | Settings & Information → Consumer protection |
| Device storage | `/legal/storage.html` | Settings & Information → Cookies & device storage |
| Provider rules | `/legal/providers.html` | Provider application and Settings |
| Deletion and data requests | `/legal/account-deletion.html` | Profile → Request account deletion and Settings |

Public pages do not require authentication, set cookies or activate analytics. The same revision is bundled into Flutter and works offline. Email links prepare a message; they do not send one automatically. Signed-in users can submit a request through the existing Support API, with its existing permissions and limits; the email route remains available when sign-in or support submission is unavailable.

The configured support address is **onecalltech@gmail.com**, supplied by the owner. The owner must confirm it is monitored, assign responsibility for data requests and test receipt before publication. The new entry points enable requests, not automated fulfilment. No deletion/export worker or data-retention schedule is installed by this update.

## Corrections to the supplied text

- Replace the original brand throughout with OneCall and use the actual revision date, not 9 July 2026.
- Payments remain unavailable. Paystack is proposed integration code; there is no live escrow, protected hold, automatic refund or payout promise. Remove contradictory processor names.
- Providers use the same Flutter app's Provider Workspace. Current provider approval does not prove NIN verification, identity-selfie verification, bank KYC or professional certification.
- Describe only current data flows. No booking voice-note, portfolio, ratings, third-party behavioural analytics, advertising reward or AI processing is claimed to be active.
- Unassigned providers do not see the full job address or description. Assigned providers and authorised operators have the relevant access. Optional GPS sharing stops in the background; the last stored coordinate remains until terminal booking cleanup.
- Do not claim primarily Nigerian hosting. Identify actual cloud/vendor regions and lawful transfer safeguards before launch.
- Privacy notices explain processing; they are not blanket consent. Location permission, future marketing and ad choices require distinct treatment.
- A provider's completed status is not customer satisfaction approval or payment release. New work/charges require customer agreement.
- Remove the unreviewed ₦50,000 liability cap, blanket indemnity, punitive chargeback restriction and absolute off-platform-payment ban while payments are deferred. Preserve mandatory consumer rights and regulator/court access.

## Operational application before public launch

1. Confirm the registered controller/operator name, business address, support ownership and intended adults-only eligibility policy. Do not assume NORTHCREST or another business is the operator without the owner's confirmation.
2. Approve the terms through legal review. Record policy-version acceptance on the backend, including appropriate provider terms, and notify existing users before materially changed obligations apply. Current registration links provide visibility only; no acceptance audit is represented as implemented and existing APIs/accounts remain compatible.
3. Approve a category-specific retention and backup-expiry schedule. Implement and verify removal/anonymisation across accounts, sessions, messages, addresses, notifications, uploads, vendor copies and backup recovery, with lawful exceptions documented. Verify export without credential/hash disclosure. A request or deactivation alone is not compliance.
4. Monitor email/support requests, record intake and identity verification, assign deadlines from applicable law and provide a review/escalation process. Do not require NIN, passwords or OTPs to make a routine privacy request.
5. Confirm cloud regions, processors and contracts, transfer safeguards, least-privilege access, incident response and applicable NDPC obligations. Assess registration/DPO/DPIA requirements with qualified advisers against actual scale and processing. No certification or registration is claimed here.
6. Add public HTTPS privacy and deletion URLs to Play Console and complete accurate Data safety declarations for the release's actual SDKs and data flows. Remove `noindex` from generated pages only if appropriate after final approval; it does not block access by URL.
7. Complete booking/quote/cancellation/support acceptance testing and review complaint handling. Do not promise automated refunds, customer-confirmed completion or fees that the current workflows cannot perform.
8. Before activating payments, AdMob or Amboy, review the changed data inventory, vendors, consent/disclosure choices and operational terms. Optional rewarded ads must not gate ordinary booking or login. Amboy must respect account permissions, action confirmation and data minimisation; no AI vendor/data-training policy is assumed.

## Editing and verification

Edit `docs/legal/onecall-policies.json`, then run:

```bash
python3 scripts/generate-legal-pages.py
python3 scripts/generate-legal-pages.py --check
pnpm --filter backend build
pnpm --filter backend test:legal
```

Generated outputs are `apps/backend/legal-web/*.html`, the bundled Flutter JSON and `docs/legal/ONECALL-LEGAL-DRAFT.md`. The web stylesheet is maintained separately. Keep `legal-web` beside `dist` when deploying the backend, as with `admin-web`. The source packager includes it.

Flutter must also be analysed/tested and rebuilt on a machine with the Flutter/Android SDK:

```bash
cd apps/mobile
flutter pub get
dart format lib/ui/legal_page.dart lib/ui/auth_page.dart lib/ui/profile_pages.dart
flutter analyze
flutter test
```

The public paths are outside `api/v1`, for example `https://<backend-host>/legal/privacy.html`. They become internet-accessible only when the backend is deployed; adding files locally does not publish them.

## Sources checked on 13 October 2026

- NDPC official resources: <https://ndpc.gov.ng/>; official journal/annual-report indexed excerpts identify GAID 2025. Direct document retrieval returned 403 in this environment; detailed statutory deadlines and clauses require final legal review.
- NDPC journal: <https://ndpc.gov.ng/wp-content/uploads/2026/02/NDPC-Journal-2026-1.pdf>.
- FCCPC consumer rights: <https://fccpc.gov.ng/consumers/consumer-rights-responsibilities/rights-responsibilities/>. Clear prices, fair dealing, cancellation and mandatory liability protections inform this draft.
- Google Play account deletion: <https://support.google.com/googleplay/android-developer/answer/13327111?hl=en>. A request route may use a monitored email, but actual associated-data deletion, accurate retention disclosure and a functioning public web resource remain required.
