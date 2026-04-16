-- ============================================================
-- ShadeLogic Phase 12 — Row Level Security + Permissions
-- ============================================================
-- IMPORTANT: Run this in TWO steps:
--
-- STEP 1: Run the top section (permissions schema)
-- STEP 2: Sign up at /signup if you haven't already
-- STEP 3: Get your company_id:
--   SELECT id FROM companies ORDER BY created_at DESC LIMIT 1;
-- STEP 4: Update all your existing data (replace YOUR_COMPANY_ID):
--   UPDATE customers       SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE measure_jobs    SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE rooms           SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE windows         SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE appointments    SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE tasks           SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE activity_log    SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE customer_phones SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE quotes          SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE quote_line_items SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE quote_materials  SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE product_catalog  SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE quote_templates  SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE company_settings SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
-- STEP 5: Run the RLS section below
-- ============================================================

-- ── STEP 1: Permissions on profiles ──────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_by  UUID REFERENCES auth.users(id);

-- Helper: get current user's company_id (used by all RLS policies)
CREATE OR REPLACE FUNCTION get_company_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$;

-- ── STEP 5: Enable RLS on all tables ─────────────────────────
-- (Only run after completing steps 2-4 above)

ALTER TABLE customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_phones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE measure_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE windows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE window_photos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE install_issues   ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_materials  ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog  ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- ── Standard policy: authenticated users see own company data ─

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'customers','customer_phones','measure_jobs','rooms','windows',
    'window_photos','install_issues','appointments','tasks','activity_log',
    'quotes','quote_line_items','quote_materials','product_catalog',
    'quote_templates','company_settings'
  ]) LOOP
    EXECUTE format('
      CREATE POLICY "company_read"   ON %I FOR SELECT TO authenticated USING (company_id = get_company_id());
      CREATE POLICY "company_insert" ON %I FOR INSERT TO authenticated WITH CHECK (company_id = get_company_id());
      CREATE POLICY "company_update" ON %I FOR UPDATE TO authenticated USING (company_id = get_company_id());
      CREATE POLICY "company_delete" ON %I FOR DELETE TO authenticated USING (company_id = get_company_id());
    ', t, t, t, t);
  END LOOP;
END $$;

-- ── Public (anon) access for customer-facing pages ───────────

-- Customer quote approval page (/q/[id]) — read quote + company info
CREATE POLICY "anon_read_quotes"
  ON quotes FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_quote_lines"
  ON quote_line_items FOR SELECT TO anon USING (true);

CREATE POLICY "anon_approve_quote"
  ON quotes FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_read_company_settings"
  ON company_settings FOR SELECT TO anon USING (true);

-- Lead intake form (/intake) — anon can insert new customer
CREATE POLICY "anon_intake_insert"
  ON customers FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_intake_log"
  ON activity_log FOR INSERT TO anon WITH CHECK (true);

-- ── Quote template lines (join table — uses template's company) ─
ALTER TABLE quote_template_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qtl_read"   ON quote_template_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM quote_templates t WHERE t.id = template_id AND t.company_id = get_company_id()));
CREATE POLICY "qtl_insert" ON quote_template_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM quote_templates t WHERE t.id = template_id AND t.company_id = get_company_id()));
CREATE POLICY "qtl_delete" ON quote_template_lines FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM quote_templates t WHERE t.id = template_id AND t.company_id = get_company_id()));
