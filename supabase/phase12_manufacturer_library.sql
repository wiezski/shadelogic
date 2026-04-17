-- ============================================================
-- ZeroRemake Phase 12 — Manufacturer Library + Change Tracking
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================
-- ⚠️ EXPECTED WARNINGS:
--   "ALTER TABLE ... ADD COLUMN IF NOT EXISTS" may say "column already exists" — safe to ignore
--   Policies with IF NOT EXISTS may warn — safe to ignore
-- ============================================================

-- ── manufacturer_library ────────────────────────────────────
-- Central product database maintained by ZeroRemake.
-- Dealers browse and "add to my catalog" to import products.
-- NOT company-scoped — this is a shared resource.
CREATE TABLE IF NOT EXISTS manufacturer_library (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  manufacturer    TEXT        NOT NULL,
  product_name    TEXT        NOT NULL,
  category        TEXT        NOT NULL DEFAULT 'other',
  sku             TEXT,

  -- Specs
  min_width       TEXT,
  max_width       TEXT,
  min_height      TEXT,
  max_height      TEXT,
  lead_time_days  INT,
  color_options   TEXT,

  -- Pricing guidance (MSRP or dealer cost range)
  msrp            NUMERIC(10,2),
  dealer_cost_low NUMERIC(10,2),
  dealer_cost_high NUMERIC(10,2),

  -- Metadata
  product_line    TEXT,         -- e.g. "Duette", "Silhouette", "Woodlore"
  description     TEXT,
  image_url       TEXT,
  spec_url        TEXT,         -- link to manufacturer spec sheet

  -- Status tracking
  status          TEXT        NOT NULL DEFAULT 'active', -- 'active' | 'discontinued' | 'limited'
  discontinued_at TIMESTAMPTZ,
  discontinued_reason TEXT,

  -- Data source
  source          TEXT        DEFAULT 'manual', -- 'manual' | 'scrape' | 'import'
  last_verified   TIMESTAMPTZ DEFAULT NOW(),

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mfg_lib_manufacturer_idx ON manufacturer_library (manufacturer, status);
CREATE INDEX IF NOT EXISTS mfg_lib_category_idx ON manufacturer_library (category, status);
CREATE INDEX IF NOT EXISTS mfg_lib_product_line_idx ON manufacturer_library (product_line);
CREATE UNIQUE INDEX IF NOT EXISTS mfg_lib_unique_product ON manufacturer_library (manufacturer, product_name, COALESCE(sku, ''));

-- ── manufacturer_brands ─────────────────────────────────────
-- Tracks which manufacturer brands exist in the library
CREATE TABLE IF NOT EXISTS manufacturer_brands (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT        NOT NULL UNIQUE,
  logo_url        TEXT,
  website_url     TEXT,
  scrape_url      TEXT,         -- URL to scrape for product updates
  product_count   INT         DEFAULT 0,
  last_scraped    TIMESTAMPTZ,
  active          BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── product_changes ─────────────────────────────────────────
-- Tracks every change to library products for dealer notifications
CREATE TABLE IF NOT EXISTS product_changes (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  library_product_id UUID     NOT NULL REFERENCES manufacturer_library(id) ON DELETE CASCADE,
  change_type     TEXT        NOT NULL, -- 'discontinued' | 'spec_change' | 'price_change' | 'new_product' | 'color_change' | 'reactivated'
  field_changed   TEXT,                 -- which field changed (e.g. 'max_width', 'status', 'color_options')
  old_value       TEXT,
  new_value       TEXT,
  description     TEXT        NOT NULL, -- human-readable: "Max width changed from 96" to 120""

  -- Suggestion for affected dealers
  suggestion      TEXT,                 -- "Consider Hunter Douglas Duette as alternative"
  suggested_product_id UUID   REFERENCES manufacturer_library(id),

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_changes_product_idx ON product_changes (library_product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_changes_type_idx ON product_changes (change_type, created_at DESC);

-- ── dealer_library_subscriptions ────────────────────────────
-- Tracks which manufacturers each dealer company uses.
-- When products change, dealers with subscriptions get notified.
CREATE TABLE IF NOT EXISTS dealer_library_subscriptions (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  manufacturer    TEXT        NOT NULL,
  subscribed_at   TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, manufacturer)
);

CREATE INDEX IF NOT EXISTS dealer_lib_sub_company_idx ON dealer_library_subscriptions (company_id);

-- ── dealer_product_alerts ───────────────────────────────────
-- Notifications sent to dealers about product changes
CREATE TABLE IF NOT EXISTS dealer_product_alerts (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  change_id       UUID        NOT NULL REFERENCES product_changes(id) ON DELETE CASCADE,
  library_product_id UUID     NOT NULL REFERENCES manufacturer_library(id) ON DELETE CASCADE,

  -- Alert content
  title           TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  severity        TEXT        NOT NULL DEFAULT 'info', -- 'info' | 'warning' | 'critical'

  -- Suggestion
  suggestion      TEXT,
  suggested_product_id UUID   REFERENCES manufacturer_library(id),

  -- Status
  read            BOOLEAN     DEFAULT FALSE,
  dismissed       BOOLEAN     DEFAULT FALSE,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dealer_alerts_company_idx ON dealer_product_alerts (company_id, read, created_at DESC);

-- ── RLS — manufacturer_library is READ-ONLY for all authenticated users ──
ALTER TABLE manufacturer_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfg_lib_select ON manufacturer_library
  FOR SELECT TO authenticated USING (true);

-- Only service role can insert/update/delete (admin managed)
-- No insert/update/delete policies for regular users

-- ── RLS — manufacturer_brands (read-only for users) ──
ALTER TABLE manufacturer_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfg_brands_select ON manufacturer_brands
  FOR SELECT TO authenticated USING (true);

-- ── RLS — product_changes (read-only for users) ──
ALTER TABLE product_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_changes_select ON product_changes
  FOR SELECT TO authenticated USING (true);

-- ── RLS — dealer_library_subscriptions (company-scoped) ──
ALTER TABLE dealer_library_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY dealer_sub_select ON dealer_library_subscriptions
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY dealer_sub_insert ON dealer_library_subscriptions
  FOR INSERT WITH CHECK (company_id = get_my_company_id());

CREATE POLICY dealer_sub_delete ON dealer_library_subscriptions
  FOR DELETE USING (company_id = get_my_company_id());

-- ── RLS — dealer_product_alerts (company-scoped) ──
ALTER TABLE dealer_product_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY dealer_alerts_select ON dealer_product_alerts
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY dealer_alerts_update ON dealer_product_alerts
  FOR UPDATE USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── Auto-set company_id triggers ──────────────────────────
CREATE TRIGGER dealer_sub_set_company BEFORE INSERT ON dealer_library_subscriptions
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

CREATE TRIGGER dealer_alerts_set_company BEFORE INSERT ON dealer_product_alerts
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

-- ── Updated_at trigger for manufacturer_library ──────────────
DROP TRIGGER IF EXISTS mfg_lib_updated_at ON manufacturer_library;
CREATE TRIGGER mfg_lib_updated_at
  BEFORE UPDATE ON manufacturer_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Add library_product_id to product_catalog for linking ────
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS library_product_id UUID REFERENCES manufacturer_library(id);

-- ── Seed: Major window treatment manufacturers ───────────────
INSERT INTO manufacturer_brands (name, website_url) VALUES
  ('Hunter Douglas',         'https://www.hunterdouglas.com'),
  ('Graber',                 'https://www.graberblinds.com'),
  ('Levolor',                'https://www.levolor.com'),
  ('Bali',                   'https://www.baliblinds.com'),
  ('Norman',                 'https://normanusa.com'),
  ('Comfortex',              'https://www.comfortex.com'),
  ('Lutron',                 'https://www.lutron.com'),
  ('Alta Window Fashions',   'https://www.altawf.com'),
  ('Shade-O-Matic',          'https://www.shadeomatic.com'),
  ('Skandia',                'https://skandiawf.com'),
  ('Insolroll',              'https://www.insolroll.com'),
  ('Mechoshade',             'https://www.mechoshade.com')
ON CONFLICT (name) DO NOTHING;

-- ── Seed: Sample Hunter Douglas products (core product lines) ──
INSERT INTO manufacturer_library (manufacturer, product_name, category, product_line, min_width, max_width, min_height, max_height, lead_time_days, color_options, description, status) VALUES
  ('Hunter Douglas', 'Duette Honeycomb Shade',         'cellular',   'Duette',       '12', '144', '12', '120', 21, 'White|Alabaster|Linen|Dove|Pewter|Graphite', 'Energy-efficient honeycomb cellular shade with multiple pleat sizes', 'active'),
  ('Hunter Douglas', 'Silhouette Window Shadings',     'sheer',      'Silhouette',   '18', '120', '18', '120', 21, 'White|Cream|Vanilla|Pearl|Champagne',         'Sheer fabric vanes floating between sheer panels',                     'active'),
  ('Hunter Douglas', 'Pirouette Window Shadings',      'sheer',      'Pirouette',    '18', '120', '24', '96',  21, 'White|Linen|Cream',                            'Soft horizontal fabric vanes on a single sheer backing',               'active'),
  ('Hunter Douglas', 'Luminette Privacy Sheers',       'sheer',      'Luminette',    '48', '192', '36', '120', 21, 'White|Ivory|Cream|Platinum',                    'Sheer drapery panels with rotating fabric vanes',                      'active'),
  ('Hunter Douglas', 'Designer Roller Shades',         'roller',     'Roller',       '12', '120', '12', '120', 14, 'White|Ivory|Gray|Charcoal|Black',               'Classic roller shade with wide fabric selection',                       'active'),
  ('Hunter Douglas', 'Sonnette Cellular Roller Shade', 'cellular',   'Sonnette',     '12', '96',  '12', '96',  21, 'White|Champagne|Dove|Graphite',                 'Curved cellular shade with roller shade operation',                    'active'),
  ('Hunter Douglas', 'Vignette Modern Roman Shades',   'roman',      'Vignette',     '18', '144', '18', '120', 21, 'White|Vanilla|Champagne|Pewter|Graphite',       'No exposed rear cords, consistent folds',                              'active'),
  ('Hunter Douglas', 'Provenance Woven Wood Shades',   'woven',      'Provenance',   '12', '120', '12', '96',  28, 'Natural|Bamboo|Camel|Driftwood|Walnut',         'Natural woven wood and bamboo shades',                                  'active'),
  ('Hunter Douglas', 'Palm Beach Polysatin Shutters',  'shutter',    'Palm Beach',   '8',  '36',  '8',  '120', 35, 'White|Bright White|Off-White',                  'Polysatin compound resists fading, cracking, and warping',              'active'),
  ('Hunter Douglas', 'NewStyle Hybrid Shutters',       'shutter',    'NewStyle',     '8',  '36',  '8',  '120', 35, 'White|Bright White|Off-White',                  'Real wood and modern materials hybrid construction',                   'active'),
  ('Hunter Douglas', 'Heritance Hardwood Shutters',    'shutter',    'Heritance',    '8',  '36',  '8',  '120', 42, 'White|Bright White|Off-White|Custom Stain',     'Premium hardwood shutters with dovetail construction',                  'active'),
  ('Hunter Douglas', 'PowerView Motorization',         'motorized',  'PowerView',    NULL,  NULL,  NULL,  NULL, 14, NULL,                                            'Battery and hardwired motorization for most Hunter Douglas products',   'active')
ON CONFLICT (manufacturer, product_name, COALESCE(sku, '')) DO NOTHING;

-- ── Seed: Sample Graber products ────────────────────────────
INSERT INTO manufacturer_library (manufacturer, product_name, category, product_line, min_width, max_width, min_height, max_height, lead_time_days, color_options, description, status) VALUES
  ('Graber', 'CrystalPleat Cellular Shade',     'cellular',  'CrystalPleat',  '12', '120', '12', '108', 14, 'White|Snow|Ivory|Pearl|Champagne|Dove',   'Crisp pleats with variety of light control options',  'active'),
  ('Graber', 'Lightweaves Roller Shade',         'roller',    'Lightweaves',   '12', '120', '12', '120', 10, 'White|Ivory|Gray|Charcoal|Black',         'Solar and light filtering roller shades',              'active'),
  ('Graber', 'Tradewinds Woven Shade',           'woven',     'Tradewinds',    '12', '96',  '12', '96',  21, 'Natural|Bamboo|Jute|Reed',                'Natural fiber woven wood shades',                      'active'),
  ('Graber', 'Traditions Wood Blind',             'blind',     'Traditions',    '12', '72',  '12', '96',  14, 'White|Cream|Natural|Pecan|Cherry|Walnut', 'Premium hardwood blinds with custom stain options',    'active'),
  ('Graber', 'Foundations Faux Wood Blind',       'blind',     'Foundations',   '12', '72',  '12', '120', 10, 'White|Ivory|Cream|Gray',                  'Moisture-resistant faux wood blind',                    'active'),
  ('Graber', 'Fresco Roman Shade',               'roman',     'Fresco',        '18', '72',  '24', '96',  21, 'White|Linen|Cream|Dove|Stone',            'Classic Roman shade with modern fabrics',               'active'),
  ('Graber', 'Composite Shutters',               'shutter',   'Shutters',      '10', '36',  '12', '120', 28, 'White|Bright White',                      'Durable composite shutters for any room',               'active'),
  ('Graber', 'Autoview Motorization',             'motorized', 'Autoview',      NULL,  NULL,  NULL,  NULL, 14, NULL,                                     'Motorization for Graber cellular, roller, and roman shades', 'active')
ON CONFLICT (manufacturer, product_name, COALESCE(sku, '')) DO NOTHING;

-- ── Seed: Sample Norman products ────────────────────────────
INSERT INTO manufacturer_library (manufacturer, product_name, category, product_line, min_width, max_width, min_height, max_height, lead_time_days, color_options, description, status) VALUES
  ('Norman', 'Woodlore Composite Shutters',       'shutter',   'Woodlore',      '10', '36',  '12', '120', 21, 'White|Bright White|Off-White',            'Premium engineered wood composite shutters',          'active'),
  ('Norman', 'Woodlore Plus Shutters',             'shutter',   'Woodlore Plus', '10', '36',  '12', '120', 21, 'White|Bright White',                     'Hybrid wood composite with waterproof option',        'active'),
  ('Norman', 'Normandy Hardwood Shutters',         'shutter',   'Normandy',      '10', '36',  '12', '120', 28, 'White|Custom Paint|Custom Stain',        '100% premium hardwood from sustainably farmed wood',  'active'),
  ('Norman', 'SmartFold Shades',                   'cellular',  'SmartFold',     '12', '120', '12', '108', 21, 'White|Ivory|Champagne|Dove|Graphite',    'Sculpted fabric folds with smart simplicity',         'active'),
  ('Norman', 'Ultimate Faux Wood Blind',           'blind',     'Ultimate',      '12', '72',  '12', '120', 10, 'White|Ivory|Cream',                      'Premium faux wood blind with real wood look',          'active'),
  ('Norman', 'Smart Motorized Roller Shade',       'motorized', 'Norman Smart',  '12', '120', '12', '108', 14, 'White|Gray|Charcoal',                    'App-controlled motorized roller with smart home integration', 'active')
ON CONFLICT (manufacturer, product_name, COALESCE(sku, '')) DO NOTHING;

-- ── Update manufacturer brand product counts ─────────────────
UPDATE manufacturer_brands SET product_count = (
  SELECT COUNT(*) FROM manufacturer_library WHERE manufacturer_library.manufacturer = manufacturer_brands.name
);
