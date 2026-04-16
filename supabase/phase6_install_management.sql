-- ============================================================
-- ShadeLogic Phase 6 — Full Install Management
-- Installer checklists, quote→install conversion, packing list,
-- customer sign-off, enhanced completion flow
-- Run this in your Supabase SQL editor AFTER phase5_auth_multitenancy.sql
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- SECTION 1: Install checklist templates (company-defined)
-- ═══════════════════════════════════════════════════════════
-- Each company defines their own install checklist items.
-- These are templates — they get stamped onto each install job.

CREATE TABLE IF NOT EXISTS install_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  required BOOLEAN DEFAULT true,
  locked BOOLEAN DEFAULT false,  -- locked = only owner can edit/delete
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- SECTION 2: Install checklist completions (per-job)
-- ═══════════════════════════════════════════════════════════
-- When an install job is created, the company's active checklist items
-- are "stamped" onto it. Installer checks them off one by one.

CREATE TABLE IF NOT EXISTS install_checklist_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES measure_jobs(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES install_checklist_items(id) ON DELETE SET NULL,
  label TEXT NOT NULL,  -- snapshot of label at time of creation
  required BOOLEAN DEFAULT true,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  sort_order INT DEFAULT 0,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- SECTION 3: Enhance measure_jobs for install management
-- ═══════════════════════════════════════════════════════════

-- Link install job back to the quote it came from
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;

-- Customer sign-off on completion
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS customer_signature TEXT;  -- base64 data URL
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS signed_off_at TIMESTAMPTZ;
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS signed_off_name TEXT;

-- Installer tracking
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS installed_by TEXT;
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS install_started_at TIMESTAMPTZ;
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS install_completed_at TIMESTAMPTZ;
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS install_status TEXT DEFAULT 'pending';
-- install_status: 'pending' | 'in_progress' | 'completed' | 'needs_rework'

-- Materials loaded confirmation
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS materials_confirmed BOOLEAN DEFAULT false;
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS materials_confirmed_at TIMESTAMPTZ;
ALTER TABLE measure_jobs ADD COLUMN IF NOT EXISTS materials_confirmed_by TEXT;

-- ═══════════════════════════════════════════════════════════
-- SECTION 4: Link quotes to install jobs
-- ═══════════════════════════════════════════════════════════

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS install_job_id UUID REFERENCES measure_jobs(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════
-- SECTION 5: Enable RLS + triggers on new tables
-- ═══════════════════════════════════════════════════════════

ALTER TABLE install_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE install_checklist_completions ENABLE ROW LEVEL SECURITY;

-- Auto-set company_id triggers
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'install_checklist_items',
    'install_checklist_completions'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %s_auto_set_company_id ON %I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER %s_auto_set_company_id BEFORE INSERT ON %I
      FOR EACH ROW EXECUTE FUNCTION auto_set_company_id()', tbl, tbl);
  END LOOP;
END $$;

-- RLS policies
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'install_checklist_items',
    'install_checklist_completions'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', t, t);

    EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT TO authenticated
      USING (company_id = get_my_company_id())', t, t);
    EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT TO authenticated
      WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE TO authenticated
      USING (company_id = get_my_company_id())
      WITH CHECK (company_id = get_my_company_id())', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE TO authenticated
      USING (company_id = get_my_company_id())', t, t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════
-- SECTION 6: Indexes
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS install_checklist_items_company_idx ON install_checklist_items(company_id);
CREATE INDEX IF NOT EXISTS install_checklist_completions_job_idx ON install_checklist_completions(job_id);
CREATE INDEX IF NOT EXISTS install_checklist_completions_company_idx ON install_checklist_completions(company_id);
CREATE INDEX IF NOT EXISTS measure_jobs_quote_idx ON measure_jobs(quote_id);
CREATE INDEX IF NOT EXISTS measure_jobs_install_status_idx ON measure_jobs(install_status);
CREATE INDEX IF NOT EXISTS quotes_install_job_idx ON quotes(install_job_id);

-- ═══════════════════════════════════════════════════════════
-- SECTION 7: Default checklist items (starter template)
-- ═══════════════════════════════════════════════════════════
-- These won't auto-insert for existing companies.
-- New companies get them from the app's onboarding flow.
-- Existing companies can add them from Settings > Install Checklist.

/*
SUGGESTED DEFAULT ITEMS (insert manually or from app):
1. Verify all materials match order
2. Protect floors and furniture
3. Remove old treatments (if applicable)
4. Install brackets/hardware
5. Mount treatments
6. Test operation (raise/lower/tilt)
7. Test motorization (if applicable)
8. Clean up workspace
9. Walk through with customer
10. Collect sign-off
*/

-- ═══════════════════════════════════════════════════════════
-- SUMMARY
-- ═══════════════════════════════════════════════════════════
/*
NEW TABLES:
- install_checklist_items: company's reusable checklist template
- install_checklist_completions: per-job checklist stamps with completion tracking

ENHANCED TABLES:
- measure_jobs: +quote_id, +customer_signature, +signed_off_at, +signed_off_name,
                +installed_by, +install_started_at, +install_completed_at,
                +install_status, +materials_confirmed, +materials_confirmed_at, +materials_confirmed_by
- quotes: +install_job_id (back-link to the install job)

NEXT STEPS:
1. Run this migration
2. Deploy updated code
3. Add default checklist items from Settings page
*/
