-- Phase 44 — Job Duration Estimator
-- ─────────────────────────────────────────────────────────────────────
-- Job Duration Estimator: owner-defined rules that compute how long a
-- job will take based on the product mix + install factors. The
-- appointment booker can then block the calendar appropriately and
-- feed the "30 min before end of job" reminder workflow.
--
-- Data model:
--   estimation_rules      — owner-configurable rules ("15 min per
--                            blind", "+30 min if hardwired motor",
--                            "+20 min for 2nd floor", etc.)
--   job_duration_overrides— optional per-job override when the owner
--                            wants to force a specific duration.
--
-- Rule types (stored in `rule_type`):
--   'per_product_type'  — N minutes per unit of a given product category
--   'fixed_if_flag'     — adds M minutes if a job-level boolean flag is set
--   'setup_time'        — flat base time added to every job
--
-- Computation is done in app code, not SQL — these tables are just
-- the config.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- ── estimation_rules ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimation_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_type     text NOT NULL CHECK (rule_type IN ('per_product_type', 'fixed_if_flag', 'setup_time')),
  -- For 'per_product_type': product category key (e.g. 'blind', 'shutter')
  -- For 'fixed_if_flag': flag name (e.g. 'motorized', 'second_floor')
  -- For 'setup_time': ignored (null ok)
  key           text,
  -- Additional minutes added to the job's estimate
  minutes       integer NOT NULL CHECK (minutes >= 0),
  -- Human-readable label shown in settings ("15 min per blind")
  label         text NOT NULL,
  -- Soft-delete / disable without losing history
  active        boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimation_rules_company_active
  ON estimation_rules (company_id, active);

-- RLS: only the company can read/write its own rules
ALTER TABLE estimation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read rules"
  ON estimation_rules FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "owners + admins manage rules"
  ON estimation_rules FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── job_duration_overrides ──────────────────────────────────────
-- Optional: force a specific duration for one job (takes precedence
-- over the computed estimate).
CREATE TABLE IF NOT EXISTS job_duration_overrides (
  measure_job_id   uuid PRIMARY KEY REFERENCES measure_jobs(id) ON DELETE CASCADE,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  reason           text,
  set_by           uuid REFERENCES auth.users(id),
  set_at           timestamptz NOT NULL DEFAULT now()
);

-- RLS: same pattern
ALTER TABLE job_duration_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read overrides"
  ON job_duration_overrides FOR SELECT TO authenticated
  USING (
    measure_job_id IN (
      SELECT id FROM measure_jobs
      WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "owners + admins manage overrides"
  ON job_duration_overrides FOR ALL TO authenticated
  USING (
    measure_job_id IN (
      SELECT id FROM measure_jobs
      WHERE company_id IN (
        SELECT company_id FROM profiles
        WHERE id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  )
  WITH CHECK (
    measure_job_id IN (
      SELECT id FROM measure_jobs
      WHERE company_id IN (
        SELECT company_id FROM profiles
        WHERE id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- ── Seed: a few sensible defaults per company ───────────────────
-- Commented out — uncomment and adjust if you want every existing
-- company to start with these. Safe to leave off and let owners add
-- their own from Settings.
--
-- INSERT INTO estimation_rules (company_id, rule_type, key, minutes, label, sort_order)
-- SELECT id, 'setup_time',        NULL,       30, '30 min setup / wrap-up', 1  FROM companies
-- UNION ALL
-- SELECT id, 'per_product_type',  'blind',    15, '15 min per blind',       2  FROM companies
-- UNION ALL
-- SELECT id, 'per_product_type',  'shade',    20, '20 min per shade',       3  FROM companies
-- UNION ALL
-- SELECT id, 'per_product_type',  'shutter',  45, '45 min per shutter',     4  FROM companies
-- UNION ALL
-- SELECT id, 'fixed_if_flag',     'motorized',20, '+20 min if motorized',   5  FROM companies
-- UNION ALL
-- SELECT id, 'fixed_if_flag',     'second_floor', 15, '+15 min for 2nd floor', 6 FROM companies;

COMMIT;

-- To roll back:
-- BEGIN;
--   DROP POLICY IF EXISTS "owners + admins manage overrides" ON job_duration_overrides;
--   DROP POLICY IF EXISTS "company members read overrides"   ON job_duration_overrides;
--   DROP TABLE IF EXISTS job_duration_overrides;
--   DROP POLICY IF EXISTS "owners + admins manage rules"     ON estimation_rules;
--   DROP POLICY IF EXISTS "company members read rules"       ON estimation_rules;
--   DROP INDEX IF EXISTS idx_estimation_rules_company_active;
--   DROP TABLE IF EXISTS estimation_rules;
-- COMMIT;
