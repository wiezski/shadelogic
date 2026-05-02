This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Audit Pipeline

The audit funnel is the lead-gen surface for ZeroRemake. High-level flow:

**Scan flow**
- `POST /api/audit/scan` — accepts a domain, runs the 15 weighted checks in `lib/audit/checks.ts`, inserts a row into `audit_requests`, and returns the Layer 1 (gated) response. Full findings are unlocked once the visitor provides an email.

**Email unlock**
- `POST /api/audit/unlock` — captures the visitor's email, updates the `audit_requests` row, and triggers the audit-unlock email via `lib/audit/email.ts`.

**Email hardening**
- `email_send_log` table records every send attempt (kind, to, domain, ok, error, sandbox_mode) for observability.
- Sandbox-mode detection flags Resend test/sandbox sends so they don't get counted as real deliveries.
- Failure alerts go to `AUDIT_INTERNAL_ALERT_TO` (default `wiezski@gmail.com`); recursive failures (e.g. cron digest) are suppressed via `SUPPRESS_FAILURE_ALERT_KINDS`.
- Daily retry cron (`/api/cron/email-retry`) re-attempts failed sends. On days where retries occur, it sends a digest summary to the admin address (quiet days produce no email).

**Admin endpoints**
All admin endpoints share auth: `zr_admin` cookie or `x-zr-admin` header matching `AUDIT_ADMIN_TOKEN`.
- `GET /api/admin/email-status` — health snapshot (24h/7d send counts, failure list, sandbox detection, config).
- `POST /api/audit/resend` — manually re-send the unlock email for a given audit request.
- `GET /api/admin/leads` — last 50 leads with email captured, excluding walkthrough requests and blocked submissions.

**Cron schedule**
Configured in `vercel.json` under `crons[]`. Current jobs: `/api/cron/send-reminders` (08:00 UTC), `/api/cron/email-retry` (09:00 UTC).
