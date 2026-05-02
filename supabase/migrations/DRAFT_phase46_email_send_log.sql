-- Phase 46 — Email send log + reliability hardening
--
-- Adds a dedicated table to log every audit email send attempt
-- (success or failure), separately from the audit_requests row. This
-- lets us see send health independently of which scan triggered the
-- send, and gives us a clean audit trail when Resend or sandbox-mode
-- issues silently break delivery.
--
-- The audit_requests table already has email_sent / email_error /
-- email_sent_at fields for the prospect-facing email — those stay.
-- This table captures EVERY send (owner alerts, manual-review alerts,
-- walkthrough alerts, test probes, prospect emails) so all failure
-- modes are visible in one place.
--
-- Safe to apply: new table only, no changes to existing data, RLS
-- enabled with admin-only access.

BEGIN;

CREATE TABLE IF NOT EXISTS email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Which kind of email was attempted (full_report, owner_lead_alert,
  -- owner_call_alert, owner_manual_review_alert, owner_walkthrough_alert,
  -- test_probe, admin_failure_alert, etc).
  kind text NOT NULL,

  -- Recipient and message metadata.
  to_email text NOT NULL,
  subject text NOT NULL,
  domain text,                       -- domain this send relates to, when relevant
  audit_request_id uuid,             -- FK-ish reference to audit_requests.id when applicable

  -- Outcome.
  ok boolean NOT NULL,
  error text,                        -- Resend / network error message, if any
  resend_message_id text,            -- Resend's id on success, for cross-referencing their dashboard

  -- Hardening signals.
  sandbox_mode boolean NOT NULL DEFAULT false,
  -- ^ True if Resend's response indicated the account is in sandbox/
  --   test mode (e.g. "You can only send testing emails to your own
  --   email address"). When true, Steve needs to verify a sending
  --   domain at resend.com/domains.
  from_address text                  -- which from address was used (helps debug sandbox issues)
);

CREATE INDEX IF NOT EXISTS idx_email_send_log_created_at
  ON email_send_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_log_failures
  ON email_send_log (created_at DESC)
  WHERE ok = false;

CREATE INDEX IF NOT EXISTS idx_email_send_log_audit_request_id
  ON email_send_log (audit_request_id)
  WHERE audit_request_id IS NOT NULL;

-- RLS: admin-only. The service role key bypasses RLS so server code
-- can still write to the table; anon and authenticated roles get nothing.
ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for non-admin roles. Only
-- the service role can read/write this log.

-- Helpful view: recent failures only (last 30 days), useful for
-- dashboards and admin queries.
CREATE OR REPLACE VIEW email_send_failures_recent AS
SELECT
  id,
  created_at,
  kind,
  to_email,
  domain,
  audit_request_id,
  error,
  sandbox_mode,
  from_address
FROM email_send_log
WHERE ok = false
  AND created_at >= now() - interval '30 days'
ORDER BY created_at DESC;

COMMIT;

-- Rollback (if needed):
-- BEGIN;
-- DROP VIEW IF EXISTS email_send_failures_recent;
-- DROP TABLE IF EXISTS email_send_log;
-- COMMIT;
