-- ============================================================
-- Phase 8 — Automated Email Outreach
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── email_log table ──────────────────────────────────────────
-- Tracks every email sent through the system (Resend).
-- Used for deduplication (don't send reminder twice),
-- analytics, and audit trail.

CREATE TABLE IF NOT EXISTS email_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID NOT NULL REFERENCES companies(id),
  customer_id   UUID REFERENCES customers(id),
  appointment_id UUID REFERENCES appointments(id),
  quote_id      UUID REFERENCES quotes(id),
  type          TEXT NOT NULL,  -- appointment_confirmation, appointment_reminder, quote_delivery, install_followup, quote_followup, custom
  to_email      TEXT NOT NULL,
  subject       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent',  -- sent, failed, bounced
  resend_message_id TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- Users can view their company's email log
CREATE POLICY "email_log_select" ON email_log
  FOR SELECT USING (company_id = public.get_my_company_id());

-- Insert is done by server (service role), but allow client inserts too
CREATE POLICY "email_log_insert" ON email_log
  FOR INSERT WITH CHECK (company_id = public.get_my_company_id());

-- ── Auto-set company_id trigger ──────────────────────────────

CREATE TRIGGER set_email_log_company_id
  BEFORE INSERT ON email_log
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_company_id();

-- ── Indexes ──────────────────────────────────────────────────

CREATE INDEX idx_email_log_company     ON email_log (company_id);
CREATE INDEX idx_email_log_customer    ON email_log (customer_id);
CREATE INDEX idx_email_log_appointment ON email_log (appointment_id);
CREATE INDEX idx_email_log_quote       ON email_log (quote_id);
CREATE INDEX idx_email_log_type        ON email_log (type);
CREATE INDEX idx_email_log_created     ON email_log (created_at DESC);

-- ── Add email_opted_out to customers (optional opt-out) ──────

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS email_opted_out BOOLEAN DEFAULT false;

COMMENT ON TABLE email_log IS 'Tracks all transactional emails sent via Resend — used for dedup, analytics, and audit.';
COMMENT ON COLUMN email_log.type IS 'appointment_confirmation | appointment_reminder | quote_delivery | install_followup | quote_followup | custom';
