-- ============================================================
-- ShadeLogic Phase 14 — Enhanced Products + Order/Package Tracking
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ── Enhance product_catalog with manufacturer fields ────────
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS manufacturer     TEXT;
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS sku              TEXT;
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS min_width        TEXT;   -- e.g. "12"
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS max_width        TEXT;   -- e.g. "96"
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS min_height       TEXT;
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS max_height       TEXT;
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS lead_time_days   INTEGER;
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS color_options    TEXT;   -- comma-separated
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS imported_from    TEXT;   -- 'csv' | 'pdf' | 'manual'

CREATE INDEX IF NOT EXISTS product_catalog_sku_idx ON product_catalog (sku);
CREATE INDEX IF NOT EXISTS product_catalog_manufacturer_idx ON product_catalog (manufacturer);

-- ── Package tracking on quote_materials ─────────────────────
ALTER TABLE quote_materials ADD COLUMN IF NOT EXISTS expected_packages  INTEGER;  -- how many boxes/packages expected
ALTER TABLE quote_materials ADD COLUMN IF NOT EXISTS received_packages  INTEGER DEFAULT 0;  -- how many checked in so far
ALTER TABLE quote_materials ADD COLUMN IF NOT EXISTS order_pdf_path     TEXT;     -- Supabase storage path to uploaded order confirmation PDF
ALTER TABLE quote_materials ADD COLUMN IF NOT EXISTS order_pdf_text     TEXT;     -- extracted text from PDF for matching
ALTER TABLE quote_materials ADD COLUMN IF NOT EXISTS eta                TEXT;     -- estimated delivery date from email/PDF

-- ── Individual package check-in table ───────────────────────
CREATE TABLE IF NOT EXISTS material_packages (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id      UUID        NOT NULL REFERENCES quote_materials(id) ON DELETE CASCADE,
  tracking_number  TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'shipped' | 'received'
  description      TEXT,       -- optional: what's in this package
  received_at      TIMESTAMPTZ,
  received_by      TEXT,
  notes            TEXT,
  company_id       UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS material_packages_material_idx ON material_packages (material_id);

-- RLS on material_packages
ALTER TABLE material_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "co" ON material_packages
  FOR ALL TO authenticated
  USING (company_id = get_company_id())
  WITH CHECK (company_id = get_company_id());

-- ── Supabase storage bucket for order documents ─────────────
-- Run this separately if needed:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('order-documents', 'order-documents', false);
