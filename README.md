# ChamaPulse

ChamaPulse is a group savings and investment management platform for chamas and table banking groups. Its tagline is “Your Group. One Financial Pulse.” Members and moderators can manage groups, contributions, meeting calls, attendance, announcements, minutes, and payouts.

Production website: https://chamapulse.vickinstechnologies.com/

## Stack

- Next.js App Router with TypeScript
- Better Auth with MongoDB-backed sessions, Argon2id password hashes, email verification, recovery, and optional TOTP two-step verification
- Mongoose models for chama data
- Nodemailer for email, optional Twilio SMS, and Google Meet attendance sync

## Run locally

1. Install Node.js and pnpm.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Copy `.env.example` to `.env.local` and set the required values.
4. Run `pnpm dev` and open http://localhost:3000.

## Data and accounts

Set `MONGODB_URI` to the MongoDB cluster that contains existing group data. Keep the current `CHAMAHUB_MONGODB_DB` value so group, financial, and account profile collections remain available. Set `BETTER_AUTH_SECRET` to a unique random value with at least 32 characters, `BETTER_AUTH_URL` to the canonical app URL, and `EMAIL_USER`/`EMAIL_PASS` for verification and recovery mail. In production, use the public HTTPS URL for `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL`. Local development uses `http://localhost:3000`.

### Authentication migration and cutover

Better Auth stores identities in `auth_user`, credentials in `auth_account`, and sessions in `auth_session`. It uses the existing MongoDB client and keeps each ChamaPulse account `id` as the authentication user ID. Group, ledger, and other business collections are not rewritten. New registrations require email verification, and migrated users can use the password recovery flow to set a new password. Password hashes from the previous provider are never copied or assumed to be portable.

The migration script is read-only by default. Run the audit against a restored staging copy first, review all conflicts, and optionally provide a trusted identity export to preserve verified-email status and profile details:

```powershell
pnpm auth:migrate-legacy
pnpm auth:migrate-legacy -- --identity-export .\legacy-identities.json
```

The script reports duplicate/missing identity data as counts and does not print raw email addresses or account IDs. Without a trusted identity export, email addresses remain unverified unless the existing Better Auth identity already has a verified status. Applying the migration overwrites each first-time migrated credential with a random, unusable Argon2id password; users must request a password reset. The migration marker makes reruns idempotent, and existing sessions are revoked after migration. It does not modify the business `user` collection.

Production cutover requires an operator-run MongoDB backup and restore test, verification of SMTP delivery and password-reset completion using a migrated test account, a reviewed dry-run report, and a rollback plan. Only after those recovery checks pass should the operator set `AUTH_MIGRATION_BACKUP_CONFIRMED=YES` and run `pnpm auth:migrate-legacy -- --apply` against the intended database. Keep the old provider and its account data available through the agreed rollback window. This repository change does not run that production migration or switch production traffic.

### Super Admin access

Platform administration uses the separate `admin_access` collection. A Chama group administrator or a user with a legacy `role: "admin"` value does not receive `/admin` access from that role alone. After Better Auth is configured and the owner account has verified its email, provision the first Super Admin from a secure operator shell:

```powershell
$env:SUPER_ADMIN_EMAIL = "owner@example.com"
pnpm admin:bootstrap
```

The command requires exactly one verified Better Auth account with that email and a matching ChamaPulse user record. It refuses to provision a second Super Admin. Enable TOTP from `/account/security` for the owner account. Do not put the email or other runtime credentials in source control; later administrator roles are granted from `/admin` and are stored separately from group membership.

`/admin` reads grants from `admin_access`; roles or permissions in a browser session and ordinary chama member roles do not grant access. The first admin request creates indexes for admin audit/access collections and the paginated admin queries. The `admin_access_invites`, `admin_audit`, `admin_action_limits`, and `admin_user_notes` collections are created as needed.

Admin API surface:

- `GET /api/admin/dashboard` — date-filtered platform counts, trends, and recent records.
- `GET /api/admin/users`, `GET /api/admin/users/:userId`, `PATCH /api/admin/users/:userId` — paginated accounts, group/ledger history, notes, Better Auth session revocation, suspension, reactivation, and password recovery email.
- `GET /api/admin/groups`, `GET /api/admin/groups/:groupId`, `PATCH /api/admin/groups/:groupId` — paginated group records and read-only profiles; status updates use the existing active/archived values.
- `GET /api/admin/finance` — paginated, read-only financial ledger; CSV export is available with `format=csv`.
- `GET /api/admin/staff`, `POST /api/admin/staff` — existing-account grants and secure email invitations with role, module permissions, and optional expiry. Invitation access activates only after the invited Better Auth account verifies its email and claims the invitation.
- `GET /api/admin/audit` — filters and paginated audit history; CSV export is available with `format=csv`.
- `GET /api/admin/system` — read-only database and integration readiness. It never returns secret values.

Phase 2 adds these operations endpoints:

- `GET /api/admin/staff`, `POST /api/admin/staff` — paginated staff grants, invitation status, invitation revocation, and Super Admin managed role/permission updates. `GET /api/admin/staff/:userId` returns that staff member's recent audit history and recorded metrics.
- `POST`, `GET`, and `DELETE /api/admin/impersonation` — start, inspect, and terminate a short-lived restricted troubleshooting session. Starting requires recent Better Auth authentication, enabled two-step verification, and a reason. The session uses a hashed opaque token and never creates a session as the target. It presents a read-only account workspace and blocks ordinary application routes and APIs until exit or expiry.
- `GET /api/admin/notifications`, `POST /api/admin/notifications` — draft, preview, publish, schedule, archive, and inspect platform notifications. Audience resolution filters inactive/suspended accounts and deduplicates recipients. The scheduler uses the existing authenticated `/api/jobs/chama-call-notifications` job endpoint and pauses notification delivery while the global notifications feature flag is off. Delivery batches are limited to 100 recipients per job run and each audience to 50,000 recipients. In-app records are reported only after insertion; email is reported as `accepted_by_smtp`, failed, unavailable, or outcome unknown. SMTP acceptance is not proof of inbox delivery. Push notifications are not configured.
- `GET /api/admin/maintenance`, `PUT /api/admin/maintenance` — inspect and update global maintenance settings. `/admin`, auth callbacks, webhooks, payment callbacks, and background jobs remain reachable. Middleware enforces affected route prefixes server-side and caches settings for up to five seconds.
- `GET /api/admin/features`, `PATCH /api/admin/features` — inspect and change registered global feature switches. Middleware blocks mapped writes and signup entry points server-side; navigation and actions also follow public feature state. Enforcement caches values for up to five seconds. Per-environment overrides are not configured.
- `GET /api/admin/support/tickets`, `POST /api/admin/support/tickets` — staff queue, assignment, status, priority, internal notes, and replies. Users can create tickets, reply to their own tickets, and view their own history through `/api/chama/support/tickets`; create and reply actions have per-account rate limits. Tickets can reference a user's own group and ledger rows; support actions never write financial records. File attachments are not enabled because no secure upload store is configured.
- `GET /api/admin/security`, `POST /api/admin/security` — security events, generated alerts, active Better Auth administrative sessions, and authorized staff-session revocation. Authentication events are stored in MongoDB; device and IP details are shown only when the request supplied them.
- `GET /api/admin/analytics` — date-filtered account, group, member, staff audit, ticket-resolution, and ledger summaries; `format=csv` exports the report with the `reports.export` permission. Financial amounts are separated by currency and displayed in minor units. Verified contribution rows are ledger statuses, not payment-provider confirmation, and ledger totals are not platform-held funds.

The Phase 2 collections are `admin_impersonation_sessions` (hashed session token and original/target identities), `admin_notifications`, `admin_notification_recipients` (idempotent recipient queue), `user_notifications`, `platform_settings`, `platform_feature_flags`, `platform_feature_flag_history`, `admin_support_tickets`, `admin_security_events`, and `admin_security_alerts`. Admin indexes are created by the existing centralized index initializer. Notification recipients have a unique notification/user index to prevent duplicate in-app records.

Administrative audit rows are application append-only: there are no update or delete endpoints. Sensitive writes and report exports record actor, target, time, request IP when available, and filtered before/after data. The MongoDB deployment should also use an application DB principal without collection drop/delete privileges for audit collections and restricted operator access; application code cannot protect logs from a MongoDB owner.

The admin console intentionally does not create or alter financial balances. Contributions and payouts remain visible from `ChamaFinancialTransaction`; a correction must use the existing reversal/adjustment business flow. The repository has no subscription or billing models, so plans, revenue, and payment history are not fabricated. Active-user history, retention, feature adoption, and persisted system/job error history are not available because the application does not store those events. Security alerts are derived from available admin audit and rate-limit records. Password values and reset tokens are never handled by admin endpoints. Account deletion is not provided because the app has no approved user-retention/deletion workflow for linked financial records.

## Notifications and attendance

Email notifications use `EMAIL_USER` and `EMAIL_PASS`. SMS is optional and uses the Twilio variables in `.env.example`. Google Meet attendance sync uses the Google OAuth variables there. Protect the scheduled notification endpoint with `JOBS_TOKEN` and schedule it to call `/api/jobs/chama-call-notifications`.

The application needs a Node.js server because its API routes handle authentication, database access, notifications, and attendance sync.

## Financial ledger rollout

Financial writes use the `ChamaFinancialTransaction` ledger in currency minor units. New manual contributions start as `pending_verification`; a treasurer or group administrator verifies them with a note before they count toward obligations. Reversals create a linked reversal entry and retain the source transaction. Payouts move through recorded, transferred, and recipient-confirmed states. Round advancement requires every snapshotted member obligation to be verified and the payout to be confirmed by its recipient.

**MongoDB deployment requirement:** contribution, payout, reversal, reconciliation, and round advancement writes use multi-document transactions. `MONGODB_URI` must point to a MongoDB replica set or sharded cluster. A standalone MongoDB server will return a configuration error for these writes. The first finance operation also checks existing round data and creates the unique round, ledger, audit, and reconciliation indexes; duplicate round numbers or multiple open rounds stop the operation for manual review.

Before enabling finance writes on an existing database, run a dry migration audit and then the additive migration:

```powershell
pnpm finance:migrate -- --dry-run
pnpm finance:migrate
```

The migration reuses contribution IDs, preserves old contribution documents, and marks previous `paid` entries as `legacy_unverified` because the old schema did not record independent verification or the recording user. Timestamp-only payout markers are imported with unknown amount and `legacy_unverified` status; they are never presented as confirmed transfers. Legacy rounds remain `legacy_review_required` until a treasurer reviews and confirms their roster and terms. The dry run reports duplicate round/open-round groups, up to 100 source records whose group/currency cannot be determined, and the count of amounts that need treasury review. Missing group references or duplicate rounds stop an apply run before migration writes. Review the dry-run output before relying on historic balances.

Financial statements are generated on the server and apply date, member, round, type, and method filters. The PDF endpoint refuses statements above 20,000 records instead of returning a truncated report; narrow the period or filters to export a large history in complete statements. Member requests are restricted to the member's own transaction rows. A statement is labeled with its reconciliation status and does not claim to show available cash.

### M-Pesa readiness

Manual entry remains the only enabled payment path. Provider interfaces and a configuration readiness check are present, but no live Daraja initiation, callback route, or credentials are implemented. Do not set these variables as a signal that payments are verified; a future integration must add authenticated callback verification, event idempotency, and transaction reconciliation before it can change ledger status.

Future Daraja configuration requires `MPESA_ENVIRONMENT`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, and a public HTTPS `MPESA_CALLBACK_URL`.

## Environment files

The repository includes sample values only. Keep `.env.local` and other files with real credentials out of Git. Store production credentials in the deployment platform's secret manager.
