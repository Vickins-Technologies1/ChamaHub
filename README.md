# ChamaHub

ChamaHub is a standalone workspace for rotating savings groups. Moderators and members can manage groups, contributions, meeting calls, attendance, announcements, minutes, and payouts.

## Stack

- Next.js App Router with TypeScript
- Better Auth with MongoDB
- Mongoose models for chama data
- Nodemailer for email, optional Twilio SMS, and Google Meet attendance sync

## Run locally

1. Install Node.js and pnpm.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Copy `.env.example` to `.env.local` and set the required values.
4. Run `pnpm dev` and open http://localhost:3000. The root route opens the workspace at /chama.

## Data and accounts

Set `MONGODB_URI` to the MongoDB cluster that contains ChamaHub data. The default database name is `Viuckins101` to keep existing groups and accounts available. Set `CHAMAHUB_MONGODB_DB` to a new database only after migrating the ChamaHub collections. Use a unique `BETTER_AUTH_SECRET` and configure `BETTER_AUTH_BASE_URL` and `NEXT_PUBLIC_SITE_URL` for each deployment.

## Notifications and attendance

Email notifications use `EMAIL_USER` and `EMAIL_PASS`. SMS is optional and uses the Twilio variables in `.env.example`. Google Meet attendance sync uses the Google OAuth variables there. Protect the scheduled notification endpoint with `JOBS_TOKEN` and schedule it to call `/api/jobs/chama-call-notifications`.

The application needs a Node.js server because its API routes handle authentication, database access, notifications, and attendance sync.

## Environment files

The repository includes sample values only. Keep `.env.local` and other files with real credentials out of Git. Store production credentials in the deployment platform's secret manager.
