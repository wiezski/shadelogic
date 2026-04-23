# FINISH — 5 steps to turn on everything

Your VAPID keys are already generated and sitting at `.vapid-keys.local` (gitignored, not committed). Everything below is copy-paste.

**Time: ~15 minutes total.**

---

## 1. Add Vercel env vars (2 min)

Vercel Dashboard → project → Settings → Environment Variables → Add:

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `BGVwng8fGEcCnOTD1zjN35JVxJvppyOsIoQhk4-CVT-I2XX8uCGfP65qNXOScfWmGjwWXfuEVmLbi9Xja7fr0VI` | Production, Preview, Development |

Confirm `SUPABASE_SERVICE_ROLE_KEY` is already set (it's used by `/api/send-email` too). If not, grab from Supabase Dashboard → Project Settings → API → service_role key.

**Redeploy** (Deployments → latest → "..." → Redeploy). Env vars only apply to new deploys.

---

## 2. Apply the SQL migrations (5 min)

Supabase Dashboard → SQL Editor → New query. For each file below, paste the entire contents, run:

1. `supabase/migrations/phase43_push_notifications.sql` — push tables + cron
2. `supabase/migrations/phase44_job_duration_estimator.sql` — estimator tables
3. `supabase/migrations/phase45_reviews_and_requests.sql` — reviews tables

**In phase43, before running, ALSO run these two ALTER statements** (once, separately — replace the values):

```sql
ALTER DATABASE postgres SET app.supabase_url     = 'https://YOUR_PROJECT_REF.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

Your project ref is the part of your Supabase URL before `.supabase.co`. The service role key is from Settings → API.

---

## 3. Deploy the push edge function (3 min)

From your terminal, in the project root:

```bash
# One-time link if you haven't already
supabase link --project-ref YOUR_PROJECT_REF

# Set the VAPID secrets so the function can sign pushes
supabase secrets set \
  VAPID_PUBLIC_KEY=BGVwng8fGEcCnOTD1zjN35JVxJvppyOsIoQhk4-CVT-I2XX8uCGfP65qNXOScfWmGjwWXfuEVmLbi9Xja7fr0VI \
  VAPID_PRIVATE_KEY=cS7OCfoDE-Zq7Nx8UBycUPtbZ5O_6qShiAbnItAft6c \
  VAPID_SUBJECT="mailto:wiezski@gmail.com"

# Deploy
supabase functions deploy send-pushes
```

If you don't have the Supabase CLI: `brew install supabase/tap/supabase` (macOS) then `supabase login`.

---

## 4. Test (3 min)

1. On your phone in Safari, open the deployed app.
2. **iPhone only:** tap Share → Add to Home Screen. Open it from the Home Screen icon from now on.
3. Settings → My Dashboard → **Notifications on this device** → tap **Enable**, grant the permission prompt.
4. Tap **Send test push** — a notification should arrive within 60 seconds.
5. Set a few estimator rules (same page) — e.g. "30 min setup", "15 min per roller", "+20 if motorized".
6. Create an install appointment for a customer who has a quote. The modal should show "Use estimate · 2h 15m" beneath Duration.

---

## 5. Done

Delete `.vapid-keys.local` if you want (they're also in Vercel + Supabase now).

Delete `FINISH.md` and `SETUP-WEB-PUSH.md` when you don't need them anymore — everything they reference is documented in `SESSION-HANDOFF.md` and `DESIGN.md`.

---

## If something breaks

| Symptom | Check |
|---|---|
| "Send test push" says `no-subscription` | You never tapped Enable, or iOS needs Add-to-Home-Screen first |
| Tap Enable, nothing happens | Check browser console — probably `NEXT_PUBLIC_VAPID_PUBLIC_KEY` didn't redeploy |
| Notification never arrives | Supabase Dashboard → Edge Functions → `send-pushes` → Logs. If empty, pg_cron didn't invoke — check `SELECT * FROM cron.job;` |
| "Table does not exist" errors in `/reviews` or estimator settings | Migration 44 or 45 not applied yet |
| Estimator never shows a suggestion | Customer has no quote with `product_id`-linked line items, OR no active rules |

Text me what you see. I can debug from logs.
