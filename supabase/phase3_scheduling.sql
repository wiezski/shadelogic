-- ============================================================
-- ShadeLogic Phase 3 — Scheduling & Calendar
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id       UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type              TEXT        NOT NULL DEFAULT 'sales_consultation',
  -- 'sales_consultation' | 'measure' | 'install' | 'service_call' | 'repair' | 'site_walk' | 'punch'
  title             TEXT,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER     NOT NULL DEFAULT 60,
  status            TEXT        NOT NULL DEFAULT 'scheduled',
  -- 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'rescheduled' | 'canceled' | 'no_show'
  outcome           TEXT,
  -- 'measured' | 'quote_needed' | 'sold_on_site' | 'follow_up_later' | 'no_sale' | 'needs_second_visit'
  outcome_notes     TEXT,
  address           TEXT,
  notes             TEXT,
  confirmation_sent BOOLEAN     NOT NULL DEFAULT FALSE,
  reminder_sent     BOOLEAN     NOT NULL DEFAULT FALSE,
  company_id        UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appointments_customer_idx   ON appointments (customer_id);
CREATE INDEX IF NOT EXISTS appointments_scheduled_idx  ON appointments (scheduled_at);
CREATE INDEX IF NOT EXISTS appointments_active_idx     ON appointments (scheduled_at, status)
  WHERE status NOT IN ('completed', 'canceled');
