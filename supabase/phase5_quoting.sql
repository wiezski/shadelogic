-- ============================================================
-- ShadeLogic Phase 5 — Quoting / Estimating
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ── Product catalog ──────────────────────────────────────────
-- You manage this once; it auto-fills cost + markup on every quote line.
CREATE TABLE IF NOT EXISTS product_catalog (
  id                  UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  name                TEXT          NOT NULL,
  category            TEXT          NOT NULL DEFAULT 'roller',
  -- 'roller' | 'solar' | 'motorized' | 'shutter' | 'drapery' | 'other'
  default_cost        NUMERIC(10,2) NOT NULL DEFAULT 0,
  default_multiplier  NUMERIC(5,2)  NOT NULL DEFAULT 2.50,
  -- retail = cost × multiplier  (e.g. 2.5x = ~60% margin)
  notes               TEXT,
  active              BOOLEAN       NOT NULL DEFAULT TRUE,
  company_id          UUID,
  created_at          TIMESTAMPTZ   DEFAULT NOW()
);

-- ── Quote line items ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_line_items (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id         UUID          NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  window_id        UUID,         -- nullable: linked to measure window if pulled from measure
  room_name        TEXT,
  window_label     TEXT,
  product_name     TEXT          NOT NULL,
  product_id       UUID          REFERENCES product_catalog(id),
  width            TEXT,         -- pulled from measure window
  height           TEXT,
  mount_type       TEXT,
  cost             NUMERIC(10,2) NOT NULL DEFAULT 0,
  multiplier       NUMERIC(5,2)  NOT NULL DEFAULT 2.50,
  retail           NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_motorized     BOOLEAN       NOT NULL DEFAULT FALSE,
  motor_cost       NUMERIC(10,2) NOT NULL DEFAULT 0,
  motor_retail     NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  sort_order       INTEGER       DEFAULT 0,
  company_id       UUID,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quote_line_items_quote_idx ON quote_line_items (quote_id);
CREATE INDEX IF NOT EXISTS quote_line_items_window_idx ON quote_line_items (window_id);

-- ── Extend quotes table ──────────────────────────────────────
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS linked_measure_id    UUID REFERENCES measure_jobs(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS default_multiplier   NUMERIC(5,2)  DEFAULT 2.50;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_amount      NUMERIC(10,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tax_pct              NUMERIC(5,2)  DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS subtotal             NUMERIC(10,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS total                NUMERIC(10,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS cost_total           NUMERIC(10,2) DEFAULT 0;

-- ── Seed a starter product catalog ──────────────────────────
-- Edit costs to match your actual manufacturer pricing.
INSERT INTO product_catalog (name, category, default_cost, default_multiplier, notes) VALUES
  ('Roller Shade — Standard',     'roller',     85.00,  2.50, 'Basic roller, blackout or light filter'),
  ('Solar Shade — 5% Openness',   'solar',      95.00,  2.50, '5% solar screen'),
  ('Solar Shade — 3% Openness',   'solar',     100.00,  2.50, '3% solar screen'),
  ('Roller Shade — Blackout',     'roller',     95.00,  2.50, 'Full blackout liner'),
  ('Motorization Add-on',         'motorized',  95.00,  3.00, 'Battery motor per shade'),
  ('Hardwired Motor Add-on',      'motorized', 145.00,  2.75, 'Hardwired motor per shade'),
  ('Smart Home Integration',      'motorized',  45.00,  3.00, 'Hub or bridge per shade for smart home')
ON CONFLICT DO NOTHING;
