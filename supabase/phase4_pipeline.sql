-- ============================================================
-- ShadeLogic Phase 4 — Job Pipeline
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ── Quotes table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title       TEXT,
  status      TEXT        NOT NULL DEFAULT 'draft',
  -- 'draft' | 'sent' | 'approved' | 'rejected'
  amount      TEXT,
  notes       TEXT,
  sent_at     TIMESTAMPTZ,
  company_id  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quotes_customer_idx ON quotes (customer_id);

-- ── Link install jobs back to their source measure ────────────
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS linked_measure_id UUID REFERENCES measure_jobs(id);
