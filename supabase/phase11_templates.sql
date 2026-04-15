-- ============================================================
-- ShadeLogic Phase 11 — Quote Templates
-- Run this in your Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS quote_templates (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  company_id  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_template_lines (
  id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id  UUID          NOT NULL REFERENCES quote_templates(id) ON DELETE CASCADE,
  product_name TEXT          NOT NULL,
  product_id   UUID          REFERENCES product_catalog(id),
  cost         NUMERIC(10,2) DEFAULT 0,
  multiplier   NUMERIC(5,2)  DEFAULT 2.50,
  retail       NUMERIC(10,2) DEFAULT 0,
  is_motorized BOOLEAN       DEFAULT FALSE,
  motor_cost   NUMERIC(10,2) DEFAULT 0,
  motor_retail NUMERIC(10,2) DEFAULT 0,
  notes        TEXT,
  sort_order   INTEGER       DEFAULT 0
);
