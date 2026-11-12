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

## Environment files

The repository includes sample values only. Keep `.env.local` and other files with real credentials out of Git. Store production credentials in the deployment platform's secret manager.
