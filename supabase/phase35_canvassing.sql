-- Phase 35 — Canvassing tracker (Business plan feature).
--
-- Two tables:
--   canvas_territories — neighborhoods / zips the team is canvassing
--   canvas_visits      — every door-knock / flyer-drop with outcome + optional GPS
--
-- Tenant-scoped with the standard `co` policy pattern.

CREATE TABLE IF NOT EXISTS canvas_territories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       text NOT NULL,
  description text,
  zip_codes  text[],
  city       text,
  state      text,
  color      text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS canvas_visits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  territory_id uuid REFERENCES canvas_territories(id) ON DELETE SET NULL,
  address      text NOT NULL,
  lat          numeric,
  lng          numeric,
  outcome      text NOT NULL CHECK (outcome IN ('not_home', 'flyer', 'conversation', 'lead', 'do_not_contact')),
  notes        text,
  customer_id  uuid REFERENCES customers(id) ON DELETE SET NULL,
  visited_by   uuid,
  visited_at   timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS canvas_visits_company_idx ON canvas_visits(company_id);
CREATE INDEX IF NOT EXISTS canvas_visits_territory_idx ON canvas_visits(territory_id);
CREATE INDEX IF NOT EXISTS canvas_visits_visited_at_idx ON canvas_visits(visited_at DESC);
CREATE INDEX IF NOT EXISTS canvas_territories_company_idx ON canvas_territories(company_id);

ALTER TABLE canvas_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co" ON canvas_territories
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "co" ON canvas_visits
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
