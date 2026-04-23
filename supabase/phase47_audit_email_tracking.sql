-- Phase 47 — Track per-submission email delivery status on audit_requests.
--
-- Added after the audit lead-magnet funnel went live so we have
-- ground-truth visibility into which prospects got their full report
-- emailed and which failed — in the row itself, not buried in logs.
--
-- Three new columns:
--   email_sent     — flips to true when Resend accepts the user email
--   email_error    — most recent error message from a failed send
--   email_sent_at  — timestamp of the last successful send

ALTER TABLE audit_requests
  ADD COLUMN IF NOT EXISTS email_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_error TEXT,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN audit_requests.email_sent IS
  'Whether the branded full-report email was successfully sent to the prospect.';
COMMENT ON COLUMN audit_requests.email_error IS
  'Most recent Resend error message if a send attempt failed.';
COMMENT ON COLUMN audit_requests.email_sent_at IS
  'When the last successful send completed.';
