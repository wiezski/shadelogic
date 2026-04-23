-- DRAFT — REVIEW BEFORE APPLYING
-- ─────────────────────────────────────────────────────────────────────
-- Blank-measure flow: let installers create a measure job without a
-- customer, complete the work, and attach a customer later. The
-- incomplete measure should produce a follow-up reminder.
--
-- This migration:
--   1. Makes `measure_jobs.customer_id` nullable so a job can exist
--      without a customer.
--   2. Adds a `needs_customer_info` flag for quick filtering and
--      reminder generation.
--   3. Adds a partial index on the flag so the "incomplete measures"
--      query is cheap.
--
-- SAFETY:
--   - Altering `customer_id` to nullable is backward compatible; all
--     existing rows already have a value.
--   - If RLS policies on `measure_jobs` reference `customer_id`, they
--     will still work because the policies JOIN through company_id,
--     not customer_id. Double-check your RLS policies before applying.
--
-- BEFORE APPLYING:
--   - Confirm no FK constraint errors on `measure_jobs.customer_id`.
--   - Confirm no triggers assume `customer_id IS NOT NULL`.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- Make customer_id nullable. Existing rows already have values, so this
-- is a pure schema relaxation with no data changes required.
ALTER TABLE measure_jobs
  ALTER COLUMN customer_id DROP NOT NULL;

-- Quick flag for filtering. Defaults false so existing jobs are unaffected.
ALTER TABLE measure_jobs
  ADD COLUMN IF NOT EXISTS needs_customer_info boolean NOT NULL DEFAULT false;

-- Only index the true-flag rows — this keeps the index tiny.
CREATE INDEX IF NOT EXISTS idx_measure_jobs_needs_customer_info
  ON measure_jobs (company_id, needs_customer_info)
  WHERE needs_customer_info = true;

COMMIT;

-- To roll back:
-- BEGIN;
--   DROP INDEX IF EXISTS idx_measure_jobs_needs_customer_info;
--   ALTER TABLE measure_jobs DROP COLUMN IF EXISTS needs_customer_info;
--   -- Only re-add NOT NULL if all rows are guaranteed to have customer_id.
--   UPDATE measure_jobs SET customer_id = <placeholder> WHERE customer_id IS NULL;
--   ALTER TABLE measure_jobs ALTER COLUMN customer_id SET NOT NULL;
-- COMMIT;
