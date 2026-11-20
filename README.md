# ChamaPulse

ChamaPulse is a group savings and investment management platform for chamas and table banking groups. Its tagline is “Your Group. One Financial Pulse.” Members and moderators can manage groups, contributions, meeting calls, attendance, announcements, minutes, and payouts.

Production website: https://chamapulse.vickinstechnologies.com/

## Stack

- Next.js App Router with TypeScript
- Clerk for managed authentication and password recovery
- Mongoose models for chama data
- Nodemailer for email, optional Twilio SMS, and Google Meet attendance sync

## Run locally

1. Install Node.js and pnpm.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Copy `.env.example` to `.env.local` and set the required values.
4. Run `pnpm dev` and open http://localhost:3000.

## Data and accounts

Set `MONGODB_URI` to the MongoDB cluster that contains existing group data. The default database name is `Viuckins101`; retain it to keep existing groups and account profiles available. Keep the existing `CHAMAHUB_MONGODB_DB` variable name for compatibility. Configure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from the Clerk instance, and set `NEXT_PUBLIC_SITE_URL` to `https://chamapulse.vickinstechnologies.com` in production. Local development uses `http://localhost:3000`.

### Authentication migration

Clerk owns sign-in, email verification, and password recovery. Configure email/password sign-in and email verification in the Clerk Dashboard, then set the Clerk keys in the deployment environment. Existing Better Auth password hashes use a format Clerk cannot import. Before deploying the provider switch, back up MongoDB and run the one-time account import with production Clerk and MongoDB credentials:

```powershell
pnpm auth:migrate-clerk
```

The import preserves each legacy account ID as the Clerk external ID so group membership, ownership, and financial audit records keep their existing references. It assigns every legacy account an unknown random password; each existing user must choose a new password using **Forgot password** after cutover. The import is safe to rerun: it updates users by external ID or matching email rather than creating duplicates. Do not deploy the Clerk cutover until the import completes and the Clerk email/password recovery settings and production keys are in place.

### Super Admin access

Platform administration uses the separate `admin_access` collection. A Chama group administrator or a user with a legacy `role: "admin"` value does not receive `/admin` access from that role alone. After Clerk and MongoDB are configured, sign in to the app once with the existing account that will own platform access, then provision the first Super Admin from a secure operator shell:

```powershell
$env:SUPER_ADMIN_EMAIL = "owner@example.com"
pnpm admin:bootstrap
```

The command requires exactly one existing Clerk account with that verified email and a matching ChamaPulse user record. It refuses to provision a second Super Admin. Protect the owner account with Clerk MFA. Do not put the email or other runtime credentials in source control; later administrator roles are granted from `/admin` and are stored separately from group membership.

`/admin` reads grants from `admin_access`; roles or permissions in a browser session and ordinary chama member roles do not grant access. The first admin request creates indexes for admin audit/access collections and the paginated admin queries. The `admin_access_invites`, `admin_audit`, `admin_action_limits`, and `admin_user_notes` collections are created as needed.

Admin API surface:

- `GET /api/admin/dashboard` — date-filtered platform counts, trends, and recent records.
- `GET /api/admin/users`, `GET /api/admin/users/:userId`, `PATCH /api/admin/users/:userId` — paginated accounts, group/ledger history, notes, session revocation, suspension, reactivation, and secure recovery instructions through the existing Clerk flow.
- `GET /api/admin/groups`, `GET /api/admin/groups/:groupId`, `PATCH /api/admin/groups/:groupId` — paginated group records and read-only profiles; status updates use the existing active/archived values.
- `GET /api/admin/finance` — paginated, read-only financial ledger; CSV export is available with `format=csv`.
- `GET /api/admin/staff`, `POST /api/admin/staff` — existing-account grants and Clerk email invitations with role, module permissions, and optional expiry. Invitation access is activated only after the invited Clerk account verifies and claims its invitation.
- `GET /api/admin/audit` — filters and paginated audit history; CSV export is available with `format=csv`.
- `GET /api/admin/system` — read-only database and integration readiness. It never returns secret values.

Administrative audit rows are application append-only: there are no update or delete endpoints. Sensitive writes and report exports record actor, target, time, request IP when available, and filtered before/after data. The MongoDB deployment should also use an application DB principal without collection drop/delete privileges for audit collections and restricted operator access; application code cannot protect logs from a MongoDB owner.

The admin console intentionally does not create or alter financial balances. Contributions and payouts remain visible from `ChamaFinancialTransaction`; a correction must use the existing reversal/adjustment business flow. This repo currently has no subscription/billing models, platform support-ticket store, login-history store, maintenance-mode enforcement, moderator case metrics, or impersonation-session implementation. These modules are reported as unavailable instead of showing fabricated metrics. Email recovery notifications use the existing Clerk recovery page; password values and tokens are never handled by admin endpoints. Account deletion is not provided because the app has no approved user-retention/deletion workflow for linked financial records.

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
