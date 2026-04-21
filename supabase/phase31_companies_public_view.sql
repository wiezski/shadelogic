-- Phase 31 — Public view exposing only the safe, marketing-relevant columns
-- of companies. Used by customer-facing public pages (quote, invoice, builder
-- portal) to render business info and — for Business plan tenants — custom
-- branding.
--
-- Context: Phase 28 locked companies down with SELECT scoped to the user's
-- own profile. This broke anon-accessible pages that needed to read the
-- installer's name/logo/color. This view fixes that without re-exposing the
-- sensitive columns (twilio_auth_token, stripe_customer_id, etc.).
--
-- Columns exposed:
--   id, name, plan (for feature-gating),
--   brand_slug, brand_logo_url, brand_logo_mark,
--   brand_primary_color, brand_primary_hover, brand_dark_color, brand_font

CREATE OR REPLACE VIEW public.companies_public AS
SELECT
  id,
  name,
  plan,
  brand_slug,
  brand_logo_url,
  brand_logo_mark,
  brand_primary_color,
  brand_primary_hover,
  brand_dark_color,
  brand_font
FROM companies;

GRANT SELECT ON public.companies_public TO anon, authenticated;
