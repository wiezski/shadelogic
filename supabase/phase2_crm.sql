-- ============================================================
-- ShadeLogic Phase 2 — CRM Foundation
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ── CRM columns on customers ─────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lead_status  TEXT NOT NULL DEFAULT 'New';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS heat_score   TEXT NOT NULL DEFAULT 'Warm';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lead_source  TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone2       TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- ── Activity log ─────────────────────────────────────────────
-- Tracks every call, text, email, note, or visit per customer
CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL DEFAULT 'note',   -- call | text | email | note | visit
  notes       TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  company_id  UUID                                   -- reserved for multi-tenancy
);
CREATE INDEX IF NOT EXISTS activity_log_customer_idx ON activity_log (customer_id, created_at DESC);

-- ── Tasks / follow-ups ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id  UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  due_date     DATE,
  completed    BOOLEAN     NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  company_id   UUID                                  -- reserved for multi-tenancy
);
CREATE INDEX IF NOT EXISTS tasks_customer_idx ON tasks (customer_id, due_date ASC);
CREATE INDEX IF NOT EXISTS tasks_due_idx     ON tasks (due_date) WHERE completed = FALSE;

-- ── company_id stub on all existing tables ────────────────────
-- Nullable for now. When multi-tenancy ships, these get a FK + RLS policy.
ALTER TABLE customers     ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE measure_jobs  ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE rooms         ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE windows       ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE window_photos ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE install_issues ADD COLUMN IF NOT EXISTS company_id UUID;
