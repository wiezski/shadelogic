-- Phase 43 — Web Push notifications
-- ─────────────────────────────────────────────────────────────────────
--
-- Two tables:
--   push_subscriptions  — one row per (user × device). The browser's
--                          PushSubscription JSON is stored here when
--                          the user opts in. Each device gets its own
--                          row so a user can be on phone + laptop.
--   scheduled_pushes    — queued notifications. A cron job picks these
--                          up and fires them via the send-pushes Edge
--                          Function. Rows are idempotent via dedupe_key
--                          so re-running is safe.
--
-- A cron schedule is also installed at the bottom — it invokes the
-- `send-pushes` Edge Function once a minute. Deploy the edge function
-- first (supabase functions deploy send-pushes), then apply this
-- migration.
--
-- Free-tier considerations:
--   - pg_cron and pg_net are enabled on Supabase free tier.
--   - Once-a-minute = ~43k invocations/month (free tier allows 500k).
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Ensure required extensions ──────────────────────────────────
-- pg_cron schedules SQL commands; pg_net lets us POST to the edge
-- function from inside the cron job. Both are available on free tier
-- but need to be enabled once per project.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── push_subscriptions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth_key     text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  -- One subscription per unique endpoint; browsers re-use the endpoint
  -- for the same user+device so this de-dupes naturally.
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_company
  ON push_subscriptions (company_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own subscriptions"
  ON push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users manage own subscriptions"
  ON push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service-role reads allow the edge function to fetch subscriptions.
-- (Service role bypasses RLS anyway; policy is documentation.)

-- ── scheduled_pushes ────────────────────────────────────────────
-- Each row represents a notification that should fire at `fire_at`.
-- The cron job picks them up when fire_at <= now() AND sent_at IS NULL.
CREATE TABLE IF NOT EXISTS scheduled_pushes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- "appointment_30m_before_end" | "signature_prompt" | "generic" etc.
  kind          text NOT NULL,
  title         text NOT NULL,
  body          text NOT NULL,
  -- Deep link to open when tapped (e.g. /quotes/{id}, /schedule)
  url           text NOT NULL DEFAULT '/',
  -- When to fire the push
  fire_at       timestamptz NOT NULL,
  -- Idempotency key — prevents duplicate scheduling (e.g. if the
  -- appointment-create hook runs twice). Format suggestion:
  -- "{kind}:{related_id}" e.g. "appt_end:{appointment_id}"
  dedupe_key    text NOT NULL,
  sent_at       timestamptz,
  send_error    text,
  cancelled_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);

-- Cheap index for the cron worker
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_due
  ON scheduled_pushes (fire_at)
  WHERE sent_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_user
  ON scheduled_pushes (user_id, fire_at);

ALTER TABLE scheduled_pushes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own pushes"
  ON scheduled_pushes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Company members can insert pushes for anyone on their team (for
-- features like "notify the installer when their appointment comes up").
CREATE POLICY "company members schedule pushes"
  ON scheduled_pushes FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Owners can cancel/modify any push in their company
CREATE POLICY "owners manage company pushes"
  ON scheduled_pushes FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── Cron schedule ───────────────────────────────────────────────
-- Runs every minute, POSTs to the send-pushes edge function which
-- picks up any due rows and fires them. Replace {{PROJECT_REF}}
-- below with your actual Supabase project ref before running this
-- migration (it's in your dashboard URL).
--
-- The service_role key lets the edge function read subscriptions
-- and mark rows sent. Never expose it client-side.
--
-- If you've already scheduled a job with this name, this is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-pushes-every-minute'
  ) THEN
    PERFORM cron.schedule(
      'send-pushes-every-minute',
      '* * * * *',
      $cmd$
      SELECT net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/send-pushes',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
          'Content-Type', 'application/json'
        )
      );
      $cmd$
    );
  END IF;
END $$;

-- Two settings the cron job above reads. Set them ONCE per database
-- with ALTER DATABASE (run these as separate commands in the SQL
-- editor after replacing the values):
--
--   ALTER DATABASE postgres SET app.supabase_url      = 'https://YOUR_PROJECT_REF.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key  = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';
--
-- These are safe on Supabase because the service_role_key is only
-- readable by the postgres role — not by anon / authenticated users.

COMMIT;

-- To roll back:
-- BEGIN;
--   SELECT cron.unschedule('send-pushes-every-minute');
--   DROP POLICY IF EXISTS "owners manage company pushes" ON scheduled_pushes;
--   DROP POLICY IF EXISTS "company members schedule pushes" ON scheduled_pushes;
--   DROP POLICY IF EXISTS "users see own pushes" ON scheduled_pushes;
--   DROP TABLE IF EXISTS scheduled_pushes;
--   DROP POLICY IF EXISTS "users manage own subscriptions" ON push_subscriptions;
--   DROP POLICY IF EXISTS "users read own subscriptions" ON push_subscriptions;
--   DROP TABLE IF EXISTS push_subscriptions;
-- COMMIT;
