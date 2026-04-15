-- ============================================================
-- ShadeLogic Phase 2 v2 — CRM Section 1 completion
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ── Multiple phones per contact ───────────────────────────────
CREATE TABLE IF NOT EXISTS customer_phones (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone       TEXT        NOT NULL,
  label       TEXT        NOT NULL DEFAULT 'Mobile',  -- Mobile | Home | Work | Spouse | Builder | Designer | Custom
  is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  company_id  UUID
);
CREATE INDEX IF NOT EXISTS customer_phones_customer_idx ON customer_phones (customer_id);

-- ── CRM fields on customers ───────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_contact TEXT;   -- e.g. "Text only", "Call evenings", "Contact spouse first"
ALTER TABLE customers ADD COLUMN IF NOT EXISTS next_action       TEXT;   -- explicit "next action required" field
