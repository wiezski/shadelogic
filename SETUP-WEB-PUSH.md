# Web Push — Morning Setup Checklist

You woke up to a fully-built Web Push stack. The code is in production on Vercel (the app works fine without any of these steps — the Enable Notifications toggle will just say "isn't configured yet"). To make the ding actually fire, do these five things once. Total time: **~20 minutes**.

Zero subscriptions, zero external services. Just environment variables and one SQL file.

---

## 1. Generate VAPID keys (2 min)

Open a terminal on any machine with Node installed:

```bash
npx web-push generate-vapid-keys
```

Save the output — two strings labeled `Public Key` and `Private Key`. You'll need both.

---

## 2. Add keys to Vercel env vars (3 min)

Vercel Dashboard → your project → **Settings → Environment Variables**. Add:

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | (public key from step 1) | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | (from Supabase Dashboard → Project Settings → API → `service_role` key) | Production, Preview, Development |

After saving, **redeploy** (Deployments tab → "..." → Redeploy). Env vars don't live-apply.

Note: `SUPABASE_SERVICE_ROLE_KEY` is already probably set if you've used the send-email route. Check before adding.

---

## 3. Apply the migration (5 min)

Supabase Dashboard → **SQL Editor** → **New query**. Paste the entire contents of:

```
supabase/migrations/DRAFT_push_notifications.sql
```

Run it. This creates:
- `push_subscriptions` table (one row per user × device)
- `scheduled_pushes` table (the queue)
- A pg_cron job that invokes the `send-pushes` Edge Function every minute

**Before running, search-replace in the SQL:** at the bottom there's a `DO $$ ... cron.schedule(...)` block that references `current_setting('app.supabase_url')` and `current_setting('app.service_role_key')`. You need to set those two settings once. Run this separately in the SQL editor, with your values filled in:

```sql
ALTER DATABASE postgres SET app.supabase_url     = 'https://YOUR_PROJECT_REF.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

Your project ref is the first part of your Supabase URL (`abc12345.supabase.co` → `abc12345`).

---

## 4. Deploy the Edge Function (5 min)

From your project root:

```bash
# Link your local Supabase project once (skip if already done)
supabase link --project-ref YOUR_PROJECT_REF

# Push the secrets the function needs
supabase secrets set \
  VAPID_PUBLIC_KEY=YOUR_PUBLIC_VAPID_KEY \
  VAPID_PRIVATE_KEY=YOUR_PRIVATE_VAPID_KEY \
  VAPID_SUBJECT="mailto:you@yourdomain.com"

# Deploy
supabase functions deploy send-pushes
```

If you don't have the Supabase CLI installed: `brew install supabase/tap/supabase` (macOS) or follow https://supabase.com/docs/guides/cli.

---

## 5. Test (5 min)

1. Open the deployed app on your phone in Safari
2. (**iPhone only**) Tap Share → Add to Home Screen. Open it from the Home Screen icon.
3. Settings → My Dashboard → **Notifications on this device** → tap **Enable**
4. Grant the permission prompt
5. Create an appointment for yourself 31 minutes from now with yourself as the assignee
6. You should get a push notification in about 1 minute

If it doesn't work, check in order:
- Vercel Function Logs for `/api/push/subscribe` — did the subscribe call succeed?
- Supabase Edge Function logs for `send-pushes` — is it being invoked? Is it finding the row?
- Is `scheduled_pushes` getting rows inserted when you create an appointment? Supabase Table Editor.

---

## What got built

### New files

- `public/sw.js` — service worker, handles `push` and `notificationclick`
- `lib/push.ts` — client helper: `pushState()`, `enablePush()`, `disablePush()`
- `app/api/push/subscribe/route.ts` — persists a subscription for the signed-in user
- `app/api/push/unsubscribe/route.ts` — removes a subscription
- `supabase/functions/send-pushes/index.ts` — Deno edge function, pulls due rows and fires web-push
- `supabase/migrations/DRAFT_push_notifications.sql` — tables + cron schedule
- `lib/estimator.ts` — pure computation helper for job duration rules

### Integration points

- **Schedule page** (`app/schedule/page.tsx`) — when an appointment is created, schedules two pushes for the assignee:
  - "Heads up — Heading to X" 30 min before start
  - "Collect signature — X" 30 min before end (install / measure only)
  Dedupe keys prevent duplicates if the hook runs twice.
- **Settings page** (`app/settings/page.tsx`) — two new sections on "My Dashboard" tab:
  - **Notifications on this device** (enable/disable toggle, iOS install hint)
  - **Job duration estimator** (rules CRUD, shows "apply migration" state if tables don't exist yet)

### Safe fallback

Every integration is wrapped in try/catch. If the migration isn't applied, the app continues to function:
- Creating appointments still works, just doesn't schedule any pushes
- The Notifications toggle says "isn't configured yet"
- The estimator section shows an "apply the migration" message

---

## Other DRAFT migrations in the repo

| File | What it does | Apply when |
|---|---|---|
| `DRAFT_job_duration_estimator.sql` | `estimation_rules` + `job_duration_overrides` tables with RLS | You want to start configuring duration rules |
| `DRAFT_reviews_and_requests.sql` | `google_reviews` cache, `review_requests` history, `company_settings.google_place_id` | You want `/reviews` to move off localStorage into real DB |
| `DRAFT_push_notifications.sql` | The thing this doc is about | Do this one tonight to turn on pushes |

All three are safe — new tables only, nothing modifies existing data. Rollback blocks are at the bottom of each.

---

## If you hit a wall

Tell me which step failed and paste the error. I'll debug in the morning.
