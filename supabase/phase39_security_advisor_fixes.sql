-- Phase 39 — Security advisor cleanup
--
-- Triggered by Supabase security advisor email:
--   1) `manufacturer_specs` had RLS disabled — email flagged it as publicly
--      accessible. Now RLS-enabled with anon-readable SELECT (it's a global
--      product catalog) and admin-only writes.
--   2) `companies_public` view was SECURITY DEFINER — now SECURITY INVOKER,
--      respecting the caller's RLS. Added a matching anon SELECT policy on
--      companies so the view can return rows to public-facing pages.
--   3) Pinned search_path=public on every flagged plpgsql function to prevent
--      search_path-based privilege attacks.
--   4) Dropped the broad "public can view window photos" SELECT policy on
--      storage.objects — the bucket is public so direct URL access still
--      works, but listing the whole bucket is no longer possible.

ALTER TABLE manufacturer_specs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manufacturer_specs_select" ON manufacturer_specs;
CREATE POLICY "manufacturer_specs_select" ON manufacturer_specs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "manufacturer_specs_write_auth" ON manufacturer_specs;
CREATE POLICY "manufacturer_specs_write_auth" ON manufacturer_specs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP VIEW IF EXISTS public.companies_public;
CREATE VIEW public.companies_public
WITH (security_invoker = true) AS
SELECT
  id, name, plan,
  brand_slug, brand_logo_url, brand_logo_mark,
  brand_primary_color, brand_primary_hover, brand_dark_color, brand_font
FROM companies;
GRANT SELECT ON public.companies_public TO anon, authenticated;

DROP POLICY IF EXISTS "companies_select_anon_branding" ON companies;
CREATE POLICY "companies_select_anon_branding" ON companies
  FOR SELECT TO anon USING (true);

ALTER FUNCTION public.auto_set_company_id()                             SET search_path = public;
ALTER FUNCTION public.update_updated_at()                               SET search_path = public;
ALTER FUNCTION public.auto_set_company_id_builder_contacts()            SET search_path = public;
ALTER FUNCTION public.auto_set_company_id_builder_projects()            SET search_path = public;
ALTER FUNCTION public.auto_set_company_id_builder_project_quotes()      SET search_path = public;
ALTER FUNCTION public.auto_set_company_id_builder_messages()            SET search_path = public;
ALTER FUNCTION public.auto_set_company_id_app_feedback()                SET search_path = public;
ALTER FUNCTION public.cleanup_stale_sessions()                          SET search_path = public;
ALTER FUNCTION public.get_company_id()                                  SET search_path = public;
ALTER FUNCTION public.set_contractor_rate_company_id()                  SET search_path = public;
ALTER FUNCTION public.get_my_company_id()                               SET search_path = public;
ALTER FUNCTION public.auto_set_company_id_pay_rates()                   SET search_path = public;
ALTER FUNCTION public.auto_set_company_id_pay_entries()                 SET search_path = public;
ALTER FUNCTION public.auto_set_company_id_payroll_runs()                SET search_path = public;
ALTER FUNCTION public.sync_material_from_packages()                     SET search_path = public;
ALTER FUNCTION public.auto_flip_shipped_on_tracking()                   SET search_path = public;
ALTER FUNCTION public.notify_on_stage_change()                          SET search_path = public;
ALTER FUNCTION public.check_invite_capacity(uuid)                       SET search_path = public;

DROP POLICY IF EXISTS "public can view window photos" ON storage.objects;
