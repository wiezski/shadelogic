-- ============================================================
-- ShadeLogic Phase 13 — Email Order Tracking
-- Run this in your Supabase SQL editor
-- ============================================================

-- ── New columns on quote_materials ───────────────────────────
ALTER TABLE quote_materials ADD COLUMN IF NOT EXISTS auto_updated       BOOLEAN     DEFAULT FALSE;
ALTER TABLE quote_materials ADD COLUMN IF NOT EXISTS last_email_at      TIMESTAMPTZ;
ALTER TABLE quote_materials ADD COLUMN IF NOT EXISTS last_email_subject TEXT;

-- ── Email notification preferences on company_settings ───────
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS notify_on_shipped    BOOLEAN DEFAULT TRUE;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS notify_on_delivered  BOOLEAN DEFAULT TRUE;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS notify_channel       TEXT    DEFAULT 'dashboard';
-- 'dashboard' | 'text' | 'both'

-- ── Inbox for emails that couldn't be auto-matched ───────────
CREATE TABLE IF NOT EXISTS email_order_inbox (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       UUID        NOT NULL,
  from_email       TEXT,
  subject          TEXT,
  order_number     TEXT,
  tracking_number  TEXT,
  detected_status  TEXT,       -- 'ordered' | 'shipped' | 'received'
  email_body       TEXT,
  reviewed         BOOLEAN     DEFAULT FALSE,
  matched_material UUID        REFERENCES quote_materials(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_inbox_company_idx ON email_order_inbox (company_id, reviewed, created_at DESC);

-- RLS on email inbox
ALTER TABLE email_order_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "co" ON email_order_inbox
  FOR ALL TO authenticated
  USING (company_id = get_company_id())
  WITH CHECK (company_id = get_company_id());
