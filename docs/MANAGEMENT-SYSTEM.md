# OneCall Management System

The management workspace is served by the API at `/management/`. `/admin/` remains compatible. It uses the existing OneCall sign-in, keeps tokens in memory only, and requires an active staff account. Existing accounts and bookings are preserved. No owner account is granted automatically.

## Delivered areas

| Area | Available operations |
| --- | --- |
| Operations Centre | Counts and entry points for unassigned bookings, past scheduled times, provider and parcel approvals, unresolved and overdue cases |
| Booking and Dispatch | Search, status and queue filters, eligible-provider assignment, guarded cancellation, pre-work scheduling, quote review, private photo download with a reason, history |
| Providers | Search, reviewed coverage approval, approval revocation subject to active-job safeguards, pause/resume new assignments, actual booking status counts |
| Customers | Paginated account search, latest 50 bookings and support/privacy requests; no credentials or private storage keys returned |
| Parcels | Existing shop and route review, custody events and exception investigation; independent-review and recipient-code protections retained |
| Support and Disputes | Search, case ownership, priority, response deadline, escalation, customer response and resolution with history |
| Finance | Paginated payment records, provider references, mode and activation indicators; reconciliation review |
| Catalogue | Existing categories and supported states, editable descriptions and new-request pause/resume enforced by service listings and booking creation |
| Staff | Owner-only delegation/revocation of fixed responsibilities to existing accounts, password confirmation, mandatory reason, activity history |
| Reports | Last-30-day booking counts, assignment conversion, completion rate, assigned-provider activity, repeat-booking customers, successful live gross collections by currency |

## Permissions and safeguards

`ADMIN` remains the owner role. Delegated roles are `ONECALL_OPERATIONS`, `ONECALL_DISPATCH`, `ONECALL_SUPPORT`, `ONECALL_FINANCE`, and `ONECALL_AUDITOR`. The UI shows permitted areas; the backend separately checks current database membership on every request. Mutations recheck membership inside their transaction and share-lock the account; membership changes exclusively lock the target account. Already-issued tokens lose access after role revocation. Delegation cannot grant or remove owner authority or change an owner account.

Parcel review and catalogue changes remain owner-only. Provider and booking responsibilities are deliberately separate from finance and staff authority. Private photo downloads require booking-review authority and a recorded reason; neither storage paths nor public photo links are returned. Downloads do not certify that the work was completed. Existing customer quote acceptance and safe payment/cancellation rules remain in force.

Support resolution is not personal-data deletion. Deletion requests cannot be marked resolved through either support-resolution endpoint; they require the established operator deletion procedure. Privacy request duplication checks include cases under review or escalation. Internal audit reasons are not copied into customer responses.

## Capability boundaries

This release does not execute refunds, release held funds, generate commissions, perform NIN verification, or establish that an uploaded photo proves completion. It does not invent revenue: successful live collections are gross collections, test payments are excluded, and recognized OneCall revenue is explicitly unrecorded until a revenue ledger exists. Payment activation continues to use the existing separate configuration and approval controls. A requested arrival time in the past is a queue flag, not a contractual breach determination.

Provider coverage is the current skills/location model. Dedicated shift calendars, provider self-service shift calendars, measured retention cohorts, automatic dispute adjudication, native staff MFA enrollment, full-history exports, custom category creation and new-location authoring remain further work. No claim of full enterprise feature completeness is made.

## Activation and rollback

1. Back up the database through its established backup mechanism and confirm a restore path.
2. Apply the additive Prisma migration `20261123000000_management_cases`; it adds case metadata, provider assignment availability and a service settings table without rewriting existing records.
3. Build and deploy the backend with its existing environment, database, private upload storage and HTTPS configuration.
4. Open `/management/` on the API host and sign in with an existing owner account. Use Staff and Permissions to delegate limited responsibilities to an existing account by its ten-digit OneCall ID.
5. Confirm that a delegated session cannot access finance, staff administration or parcel approval without authority. Test grant/revoke with a separate account before operational use.

For application rollback, retain the additive columns/table; the previous application can ignore them. Reverting the service-pause code also removes pause enforcement, so review paused services before rolling back. Do not drop data as part of rollback. Verify hosting/database availability separately before deployment; source validation does not establish cloud health.

Changes are prepared for private repository review. Deployment is a separate verified step.
