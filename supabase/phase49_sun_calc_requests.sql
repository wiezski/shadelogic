-- Phase 49 — Public-facing Window Treatment Sun & Heat Calculator leads.
--
-- Separate table from audit_requests because the inputs and outputs are
-- completely different. Same access model: anon INSERT (public lead
-- magnet), no anon SELECT, all reads/updates via service role.

CREATE TABLE IF NOT EXISTS sun_calc_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User inputs
  address TEXT,
  zip TEXT,
  facing_direction TEXT NOT NULL,
  main_problem TEXT NOT NULL,
  room_type TEXT NOT NULL,
  preference TEXT NOT NULL,

  -- Computed output
  score INT NOT NULL,
  best_overall TEXT,
  best_budget  TEXT,
  best_premium TEXT,
  summary TEXT,
  rankings JSONB,

  -- Contact
  name TEXT,
  email TEXT,
  phone TEXT,
  call_booked BOOLEAN NOT NULL DEFAULT false,
  call_booked_at TIMESTAMPTZ,
  call_notes TEXT,

  email_captured_at TIMESTAMPTZ,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,

  ip INET,
  user_agent TEXT,
  referer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sun_calc_requests_email_idx
  ON sun_calc_requests (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS sun_calc_requests_created_idx
  ON sun_calc_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS sun_calc_requests_ip_idx
  ON sun_calc_requests (ip, created_at DESC);

ALTER TABLE sun_calc_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sun_calc_requests_insert_public"
  ON sun_calc_requests FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION sun_calc_requests_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sun_calc_requests_updated_at ON sun_calc_requests;
CREATE TRIGGER sun_calc_requests_updated_at
  BEFORE UPDATE ON sun_calc_requests
  FOR EACH ROW
  EXECUTE FUNCTION sun_calc_requests_set_updated_at();

COMMENT ON TABLE sun_calc_requests IS
  'Public Window Treatment Sun & Heat Calculator submissions.';
