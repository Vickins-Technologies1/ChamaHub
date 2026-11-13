# ChamaPulse

ChamaPulse is a group savings and investment management platform for chamas and table banking groups. Its tagline is “Your Group. One Financial Pulse.” Members and moderators can manage groups, contributions, meeting calls, attendance, announcements, minutes, and payouts.

Production website: https://chamapulse.vickinstechnologies.com/

## Stack

- Next.js App Router with TypeScript
- Better Auth with MongoDB
- Mongoose models for chama data
- Nodemailer for email, optional Twilio SMS, and Google Meet attendance sync

## Run locally

1. Install Node.js and pnpm.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Copy `.env.example` to `.env.local` and set the required values.
4. Run `pnpm dev` and open http://localhost:3000.

## Data and accounts

Set `MONGODB_URI` to the MongoDB cluster that contains existing group data. The default database name is `Viuckins101`; retain it to keep existing groups and accounts available. Keep the existing `CHAMAHUB_MONGODB_DB` variable name for compatibility. Use a unique `BETTER_AUTH_SECRET`; set `BETTER_AUTH_BASE_URL` and `NEXT_PUBLIC_SITE_URL` to `https://chamapulse.vickinstechnologies.com` in the production deployment. Local development continues to use `http://localhost:3000`.

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
