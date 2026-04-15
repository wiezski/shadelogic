-- ============================================================
-- ShadeLogic Phase 6 — Payments & Materials Tracking
-- Run this in your Supabase SQL editor
-- ============================================================

-- ── Payment tracking on quotes ───────────────────────────────
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_pct       NUMERIC(5,2)  DEFAULT 50;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_paid      BOOLEAN       DEFAULT FALSE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_paid_at   TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_amount    NUMERIC(10,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS balance_paid      BOOLEAN       DEFAULT FALSE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS balance_paid_at   TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_method    TEXT;
-- 'cash' | 'check' | 'card' | 'venmo' | 'zelle' | 'other'
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_notes     TEXT;

-- ── Materials / order tracking ───────────────────────────────
CREATE TABLE IF NOT EXISTS quote_materials (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id       UUID        NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description    TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'not_ordered',
  -- 'not_ordered' | 'ordered' | 'shipped' | 'received' | 'staged'
  vendor         TEXT,
  order_number   TEXT,
  tracking_number TEXT,
  ordered_at     TIMESTAMPTZ,
  shipped_at     TIMESTAMPTZ,
  received_at    TIMESTAMPTZ,
  notes          TEXT,
  company_id     UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quote_materials_quote_idx ON quote_materials (quote_id);
