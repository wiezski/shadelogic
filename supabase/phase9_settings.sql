-- ============================================================
-- ShadeLogic Phase 9 — Company Settings
-- Run this in your Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS company_settings (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  name                  TEXT          NOT NULL DEFAULT 'Your Company',
  phone                 TEXT,
  email                 TEXT,
  address               TEXT,
  city                  TEXT,
  state                 TEXT,
  zip                   TEXT,
  website               TEXT,
  license_number        TEXT,
  tagline               TEXT,
  default_deposit_pct   NUMERIC(5,2)  DEFAULT 50,
  default_markup        NUMERIC(5,2)  DEFAULT 2.50,
  default_quote_days    INTEGER       DEFAULT 30,
  created_at            TIMESTAMPTZ   DEFAULT NOW()
);

-- Insert a default row so settings page always has something to load
INSERT INTO company_settings (name) VALUES ('Your Company') ON CONFLICT DO NOTHING;
