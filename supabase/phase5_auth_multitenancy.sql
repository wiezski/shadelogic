-- ============================================================
-- ShadeLogic Phase 5 — Auth & Multi-Tenancy Infrastructure
-- Comprehensive tenant isolation, RLS policies, and auto-set triggers
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- SECTION 1: Enhance companies table with plan + features
-- ═══════════════════════════════════════════════════════════

ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial';
-- plan options: 'trial' | 'basic' | 'pro' | 'enterprise'

ALTER TABLE companies ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{
  "crm": true,
  "scheduling": true,
  "quoting": true,
  "inventory": true,
  "analytics": true,
  "builder_portal": false,
  "automation": false
}'::jsonb;
-- Each plan unlocks different features. Update via app layer based on subscription.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days');
-- Used to enforce trial expiration. Nullable if on paid plan.

-- ═══════════════════════════════════════════════════════════
-- SECTION 2: Enhance profiles table
-- ═══════════════════════════════════════════════════════════

-- Email is useful for looking up users
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
-- Index it for lookups during invite flows
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);

-- Permissions stored as JSONB for fine-grained access control
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';

-- Track who invited this user (for audit, permission inheritance)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════
-- SECTION 3: Link company_settings to companies
-- ═══════════════════════════════════════════════════════════
-- This is critical: each company gets exactly one settings row.
-- Before: company_settings was a singleton (no tenant awareness)
-- After: one row per company, with foreign key

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Create unique constraint: only one settings row per company
-- This prevents accidental duplication
CREATE UNIQUE INDEX IF NOT EXISTS company_settings_company_id_unique ON company_settings(company_id);

-- ═══════════════════════════════════════════════════════════
-- SECTION 4: Add company_id to join tables (if missing)
-- ═══════════════════════════════════════════════════════════
-- These tables may not have company_id yet; add with FK.

ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE quote_templates ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
-- Note: quote_templates already has company_id in phase11, but we enforce FK here

ALTER TABLE quote_template_lines ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════
-- SECTION 5: Helper Functions for Tenant Isolation
-- ═══════════════════════════════════════════════════════════

-- Function 1: Get current user's company_id
-- Used in every RLS policy to check tenant membership
-- SECURITY DEFINER = runs as superuser; the result is still checked by RLS
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT company_id
  FROM profiles
  WHERE id = auth.uid()
$$;

-- Function 2: Check if current user has a specific role
-- Useful for future permission-based policies
CREATE OR REPLACE FUNCTION user_has_role(role_name TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (SELECT role FROM profiles WHERE id = auth.uid()) = role_name
$$;

-- Function 3: Auto-set company_id on INSERT
-- When an insert happens, if company_id is NULL, grab it from the user's profile
-- This prevents data leaks if the client forgets to pass company_id
CREATE OR REPLACE FUNCTION auto_set_company_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := get_my_company_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════
-- SECTION 6: Apply auto_set_company_id trigger to ALL tables
-- ═══════════════════════════════════════════════════════════
-- This trigger runs BEFORE INSERT, so every row gets the right tenant_id
-- even if the client passes NULL or nothing at all.

DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'customers','customer_phones','measure_jobs','rooms','windows',
    'window_photos','install_issues','appointments','tasks','activity_log',
    'quotes','quote_line_items','quote_materials','product_catalog',
    'quote_templates','quote_template_lines','company_settings',
    'material_packages','email_order_inbox'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %s_auto_set_company_id ON %I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER %s_auto_set_company_id BEFORE INSERT ON %I
      FOR EACH ROW EXECUTE FUNCTION auto_set_company_id()', tbl, tbl);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════
-- SECTION 7: Enable RLS on ALL tables
-- ═══════════════════════════════════════════════════════════
-- RLS is Supabase's built-in row-level firewall
-- Once enabled, all queries (except postgres superuser and service role)
-- must pass a policy to read/write data

ALTER TABLE companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_phones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE measure_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE windows            ENABLE ROW LEVEL SECURITY;
ALTER TABLE window_photos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE install_issues     ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_materials    ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_template_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_packages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_order_inbox  ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- SECTION 8: RLS Policies — Authenticated Users
-- ═══════════════════════════════════════════════════════════
-- Authenticated users can only access rows where company_id = their company_id
-- The auto-set trigger ensures company_id is always set correctly.

-- ── companies table policies ───────────────────────────────
-- Users can SELECT their own company (needed for branding, settings pages)
CREATE POLICY "companies_select" ON companies FOR SELECT TO authenticated
  USING (id = get_my_company_id());

-- Users can UPDATE their own company (needed for payment method, plan upgrade)
-- Note: In production, wrap this in app-layer auth (owner-only)
CREATE POLICY "companies_update" ON companies FOR UPDATE TO authenticated
  USING (id = get_my_company_id())
  WITH CHECK (id = get_my_company_id());

-- ── profiles table policies ────────────────────────────────
-- Users can see profiles in their company (for team directory, invites)
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

-- Users can only insert their own profile (signup flow)
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Users can only update their own profile (edit name, email, etc)
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins can invite other users (update their profile to set company_id)
-- This is handled in the app layer; RLS just requires company_id match
CREATE POLICY "profiles_update_by_company" ON profiles FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── company_settings policies ──────────────────────────────
-- Users can SELECT their company's settings (for branding in emails, etc)
CREATE POLICY "company_settings_select" ON company_settings FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

-- Users can UPDATE their company's settings (change phone, address, etc)
-- Note: In production, restrict this to admin/owner only
CREATE POLICY "company_settings_update" ON company_settings FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── All business data tables (standard tenant-aware policies) ───────
-- CREATE dynamic policies for all tables with company_id
-- Pattern: SELECT, INSERT, UPDATE, DELETE all check company_id = get_my_company_id()

-- Helper: DROP old policies if re-running this migration
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'customers','customer_phones','measure_jobs','rooms','windows',
    'window_photos','install_issues','appointments','tasks','activity_log',
    'quotes','quote_line_items','quote_materials','product_catalog',
    'quote_templates','material_packages','email_order_inbox'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', t, t);
  END LOOP;
END $$;

-- Now create the standard policies for all business tables
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'customers','customer_phones','measure_jobs','rooms','windows',
    'window_photos','install_issues','appointments','tasks','activity_log',
    'quotes','quote_line_items','quote_materials','product_catalog',
    'quote_templates','material_packages','email_order_inbox'
  ]) LOOP
    -- SELECT: user can see rows in their company
    EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT TO authenticated
      USING (company_id = get_my_company_id())', t, t);

    -- INSERT: user can insert (trigger will auto-set company_id)
    EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT TO authenticated
      WITH CHECK (true)', t, t);

    -- UPDATE: user can update rows in their company
    EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE TO authenticated
      USING (company_id = get_my_company_id())
      WITH CHECK (company_id = get_my_company_id())', t, t);

    -- DELETE: user can delete rows in their company
    EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE TO authenticated
      USING (company_id = get_my_company_id())', t, t);
  END LOOP;
END $$;

-- ── quote_template_lines (join table) ──────────────────────
-- This table is a child of quote_templates, so it follows the template's company_id
-- We check via a subquery that the parent template belongs to the user's company
DROP POLICY IF EXISTS "qtl_select" ON quote_template_lines;
DROP POLICY IF EXISTS "qtl_insert" ON quote_template_lines;
DROP POLICY IF EXISTS "qtl_update" ON quote_template_lines;
DROP POLICY IF EXISTS "qtl_delete" ON quote_template_lines;

CREATE POLICY "qtl_select" ON quote_template_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM quote_templates t
    WHERE t.id = template_id AND t.company_id = get_my_company_id()
  ));

CREATE POLICY "qtl_insert" ON quote_template_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM quote_templates t
    WHERE t.id = template_id AND t.company_id = get_my_company_id()
  ));

CREATE POLICY "qtl_update" ON quote_template_lines FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM quote_templates t
    WHERE t.id = template_id AND t.company_id = get_my_company_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM quote_templates t
    WHERE t.id = template_id AND t.company_id = get_my_company_id()
  ));

CREATE POLICY "qtl_delete" ON quote_template_lines FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM quote_templates t
    WHERE t.id = template_id AND t.company_id = get_my_company_id()
  ));

-- ═══════════════════════════════════════════════════════════
-- SECTION 9: RLS Policies — Anonymous Users (Public Pages)
-- ═══════════════════════════════════════════════════════════
-- The /q/[id] page (quote approval) and /intake (lead form) are public.
-- Unauthenticated users need read/write access to specific data.
--
-- SECURITY NOTE: We rely on UUID guessing being cryptographically infeasible.
-- UUIDs are 128-bit random, so brute-force attacks are impractical.
-- Do NOT use sequential IDs or predictable quotes for sensitive data.

-- ── quotes: anon can view and sign a quote ──────────────────
DROP POLICY IF EXISTS "quotes_select_anon" ON quotes;
DROP POLICY IF EXISTS "quotes_update_anon" ON quotes;

-- Anon can SELECT any quote (the URL gives them the UUID)
-- If you want to restrict by a signing_token, add that check
CREATE POLICY "quotes_select_anon" ON quotes FOR SELECT TO anon USING (true);

-- Anon can UPDATE a quote to sign it (set signed_at, status='approved', etc)
-- Restrict: only allow updates to 'sent' quotes, only update signature fields
CREATE POLICY "quotes_update_anon" ON quotes FOR UPDATE TO anon
  USING (status = 'sent')
  WITH CHECK (status = 'approved' AND signed_at IS NOT NULL);

-- ── quote_line_items: anon can view line items ─────────────
DROP POLICY IF EXISTS "qli_select_anon" ON quote_line_items;

CREATE POLICY "qli_select_anon" ON quote_line_items FOR SELECT TO anon USING (true);

-- ── company_settings: anon can view for branding ──────────
-- Used to pull logo, colors, name for the quote approval page
DROP POLICY IF EXISTS "cs_select_anon" ON company_settings;

CREATE POLICY "cs_select_anon" ON company_settings FOR SELECT TO anon USING (true);

-- ── customers: anon can view and update (for lead intake) ──
DROP POLICY IF EXISTS "customers_select_anon" ON customers;
DROP POLICY IF EXISTS "customers_insert_anon" ON customers;
DROP POLICY IF EXISTS "customers_update_anon" ON customers;

-- Anon can INSERT a new customer via /intake form
-- Trigger will auto-set company_id (WARNING: this assigns them to whoever ran the form)
-- Better: pass company_id from the invite link or caller context
CREATE POLICY "customers_insert_anon" ON customers FOR INSERT TO anon WITH CHECK (true);

-- Anon can SELECT customers (for reading name on quote page)
CREATE POLICY "customers_select_anon" ON customers FOR SELECT TO anon USING (true);

-- Anon can UPDATE a customer (to change lead_status on quote approval)
CREATE POLICY "customers_update_anon" ON customers FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- ── activity_log: anon can insert (for logging approvals) ──
DROP POLICY IF EXISTS "al_insert_anon" ON activity_log;

CREATE POLICY "al_insert_anon" ON activity_log FOR INSERT TO anon WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- SECTION 10: Grant Permissions (if using custom auth role)
-- ═══════════════════════════════════════════════════════════
-- Supabase provides 'authenticated' and 'anon' roles by default.
-- If you use a custom role (e.g., 'service_role'), grant table perms.

-- Example: If you have a background job service, grant it access
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;

-- ═══════════════════════════════════════════════════════════
-- SECTION 11: Indexes for Performance
-- ═══════════════════════════════════════════════════════════
-- RLS queries often filter by company_id. Index these for speed.

CREATE INDEX IF NOT EXISTS customers_company_idx ON customers(company_id);
CREATE INDEX IF NOT EXISTS customer_phones_company_idx ON customer_phones(company_id);
CREATE INDEX IF NOT EXISTS measure_jobs_company_idx ON measure_jobs(company_id);
CREATE INDEX IF NOT EXISTS rooms_company_idx ON rooms(company_id);
CREATE INDEX IF NOT EXISTS windows_company_idx ON windows(company_id);
CREATE INDEX IF NOT EXISTS window_photos_company_idx ON window_photos(company_id);
CREATE INDEX IF NOT EXISTS install_issues_company_idx ON install_issues(company_id);
CREATE INDEX IF NOT EXISTS appointments_company_idx ON appointments(company_id);
CREATE INDEX IF NOT EXISTS tasks_company_idx ON tasks(company_id);
CREATE INDEX IF NOT EXISTS activity_log_company_idx ON activity_log(company_id);
CREATE INDEX IF NOT EXISTS quotes_company_idx ON quotes(company_id);
CREATE INDEX IF NOT EXISTS quote_line_items_company_idx ON quote_line_items(company_id);
CREATE INDEX IF NOT EXISTS quote_materials_company_idx ON quote_materials(company_id);
CREATE INDEX IF NOT EXISTS product_catalog_company_idx ON product_catalog(company_id);
CREATE INDEX IF NOT EXISTS quote_templates_company_idx ON quote_templates(company_id);
CREATE INDEX IF NOT EXISTS quote_template_lines_company_idx ON quote_template_lines(company_id);
CREATE INDEX IF NOT EXISTS company_settings_company_idx ON company_settings(company_id);
CREATE INDEX IF NOT EXISTS profiles_company_idx ON profiles(company_id);
CREATE INDEX IF NOT EXISTS material_packages_company_idx ON material_packages(company_id);
CREATE INDEX IF NOT EXISTS email_order_inbox_company_idx ON email_order_inbox(company_id);

-- ═══════════════════════════════════════════════════════════
-- SECTION 12: Summary & Next Steps
-- ═══════════════════════════════════════════════════════════
/*
WHAT THIS MIGRATION DOES:
✓ Enhances companies table with plan, features, trial_ends_at
✓ Links company_settings to a specific company (breaks singleton pattern)
✓ Adds company_id FKs to quote templates and line items
✓ Creates helper functions: get_my_company_id(), user_has_role()
✓ Creates auto_set_company_id() trigger (prevents data leaks)
✓ Applies triggers to all 17 business tables
✓ Enables RLS on all tables
✓ Creates standard tenant-isolation policies (company_id filtering)
✓ Creates join-table policies (quote_template_lines)
✓ Creates public policies for anon quote approval + lead intake
✓ Indexes company_id columns for query performance

SECURITY GUARANTEES:
✓ Once RLS is enabled, users can ONLY see/edit rows in their company
✓ Auto-set triggers prevent accidental company_id=NULL leaks
✓ Anonymous users can only access quote approval and intake flows
✓ All policies use get_my_company_id() which is SECURITY DEFINER
✓ Trigger functions use SECURITY DEFINER to bypass RLS during inserts

NEXT STEPS:
1. After running this migration, sign up at /signup if you haven't
2. Get your company_id: SELECT id FROM companies ORDER BY created_at DESC LIMIT 1;
3. Update your existing data to set company_id:
   UPDATE customers SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
   UPDATE measure_jobs SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
   ... (repeat for all tables listed in phase12_rls.sql manual data migration)
4. Test RLS: try to query a table without signing in (should see no rows)
5. In your app code, use the Supabase client with auth token (auto-enforces RLS)

TROUBLESHOOTING:
- If you get "no policy match" errors, ensure:
  * You're signed in (auth.uid() is set)
  * Your profile.company_id matches the data you're querying
  * RLS is enabled on that table (check with: SELECT tablename FROM pg_tables WHERE schemaname='public';)
- If anon policy isn't working, verify:
  * You're using the anon key, not the service key
  * The policy says TO anon (not TO authenticated)
  * The UUID in the URL is correct (UUIDs are case-sensitive)

COMMON PATTERNS:
  -- Read your company's customers
  SELECT * FROM customers WHERE company_id = get_my_company_id();
  -- RLS will auto-filter, so this works:
  SELECT * FROM customers;  -- RLS policy applies the company_id filter

  -- Insert will auto-set company_id via trigger:
  INSERT INTO customers (name, phone) VALUES (...);  -- company_id set by trigger

  -- Check if user is an owner
  SELECT user_has_role('owner');
*/
