-- ============================================================
-- ZeroRemake Phase 7 — White-Label Tenant Branding
-- Adds branding columns to companies table so each tenant
-- can override colors, logo, and fonts.
-- Run this in your Supabase SQL editor AFTER phase6_install_management.sql
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- SECTION 1: Branding columns on companies
-- ═══════════════════════════════════════════════════════════

ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_slug TEXT UNIQUE;
  -- Slug used for data-tenant attribute and URL subdomain (future)
  -- e.g. "acme-blinds"

ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_primary_color TEXT;
  -- Hex color, e.g. "#0066cc" — overrides --zr-orange

ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_primary_hover TEXT;
  -- Hex color for hover state — overrides --zr-orange-hover

ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_dark_color TEXT;
  -- Hex color for dark background — overrides --zr-dark

ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_font TEXT;
  -- Google Font family name, e.g. "Inter" — overrides --zr-font-display/body

ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_logo_url TEXT;
  -- URL to tenant logo (stored in Supabase storage or external)

ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_logo_mark TEXT;
  -- Optional: single character or short text for icon mark (like "Z")

-- ═══════════════════════════════════════════════════════════
-- SECTION 2: Indexes
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS companies_brand_slug_idx ON companies(brand_slug);

-- ═══════════════════════════════════════════════════════════
-- SUMMARY
-- ═══════════════════════════════════════════════════════════
/*
ENHANCED TABLES:
- companies: +brand_slug, +brand_primary_color, +brand_primary_hover,
             +brand_dark_color, +brand_font, +brand_logo_url, +brand_logo_mark

HOW IT WORKS:
1. Each company can optionally set branding fields
2. On login, the auth-provider loads branding from the companies table
3. If brand_slug exists, <html data-tenant="slug"> is set
4. CSS variables are injected as inline --tenant-* vars
5. The [data-tenant] CSS rule in globals.css picks them up
6. All components using --zr-* variables auto-recolor

DEFAULT: No branding set = ZeroRemake default orange/dark theme
*/
