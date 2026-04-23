-- Phase 46 — Public-facing Website Audit lead magnet.
--
-- Stores every submission to the free /audit tool on the marketing site.
-- This is a PUBLIC table written to by the anon key (no auth required) —
-- prospects land on zeroremake.com/audit, type their URL, and we capture
-- the submission. The data is NOT tenant-scoped; it sits outside the
-- multi-tenant app RLS model because these are external leads, not
-- customers of a specific company.
--
-- Access model:
--   - Anon/authenticated CAN insert (public lead magnet).
--   - Anon/authenticated CANNOT select (findings/emails are our internal
--     lead data; never readable from the client).
--   - Service role (used by our own API routes and admin) can do anything.
--
-- API flow:
--   1. /api/audit/scan runs the scan and inserts a row with score +
--      findings + domain + ip. Email is null initially.
--   2. /api/audit/unlock updates the row with the email once the user
--      enters it in Layer 2.
--   3. /api/audit/book-call flips call_booked=true when Layer 3
--      CTA is submitted.

CREATE TABLE IF NOT EXISTS audit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What they scanned
  url TEXT NOT NULL,                  -- original URL as typed
  domain TEXT NOT NULL,               -- normalized hostname (lowercase, no www)

  -- Contact (filled in over time as the funnel progresses)
  email TEXT,                         -- captured in Layer 2
  name TEXT,                          -- captured in Layer 3 call booking
  phone TEXT,                         -- captured in Layer 3 call booking

  -- Scan results
  score INT NOT NULL,                 -- 0-100
  findings JSONB NOT NULL,            -- full structured scan output
  top_three JSONB,                    -- redundant but keeps querying easy
  error TEXT,                         -- populated if the scan failed partway

  -- Funnel progression
  email_captured_at TIMESTAMPTZ,
  call_booked BOOLEAN NOT NULL DEFAULT false,
  call_booked_at TIMESTAMPTZ,
  call_notes TEXT,                    -- free-form from the booking form

  -- Attribution
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

CREATE INDEX IF NOT EXISTS audit_requests_domain_idx
  ON audit_requests (domain);

CREATE INDEX IF NOT EXISTS audit_requests_created_at_idx
  ON audit_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_requests_ip_created_idx
  ON audit_requests (ip, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_requests_email_idx
  ON audit_requests (email)
  WHERE email IS NOT NULL;

-- RLS: enable, but only allow INSERT from anon/authenticated.
-- SELECT/UPDATE/DELETE require service role (which bypasses RLS).
ALTER TABLE audit_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (even unauthenticated) can insert a scan request.
CREATE POLICY "audit_requests_insert_public"
  ON audit_requests FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Intentionally NO select/update/delete policies for anon/authenticated.
-- All reads and updates go through server-side code using the service role.

-- updated_at trigger
CREATE OR REPLACE FUNCTION audit_requests_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_requests_updated_at ON audit_requests;
CREATE TRIGGER audit_requests_updated_at
  BEFORE UPDATE ON audit_requests
  FOR EACH ROW
  EXECUTE FUNCTION audit_requests_set_updated_at();

COMMENT ON TABLE audit_requests IS
  'Public website-audit lead magnet submissions from zeroremake.com/audit. External prospects, not tenant-scoped.';
