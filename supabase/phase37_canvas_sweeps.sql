-- Phase 37 — Street-sweep bulk logging.
--
-- Real canvassing reality: most of the work is "I walked this whole street and
-- dropped a hanger on every door." Logging 40 individual canvas_visits rows
-- for that is annoying. A `canvas_sweep` is a single row representing a bulk
-- walk: one street, approximate door count, outcomes rolled up.
--
-- Individual canvas_visits are still used for conversations / leads / DNC
-- where per-house detail matters.

CREATE TABLE IF NOT EXISTS canvas_sweeps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  territory_id     uuid REFERENCES canvas_territories(id) ON DELETE SET NULL,
  street_name      text NOT NULL,
  section          text,
  hangers_dropped  integer DEFAULT 0,
  knocked_count    integer DEFAULT 0,
  no_answer_count  integer DEFAULT 0,
  lat              numeric,
  lng              numeric,
  notes            text,
  walked_by        uuid,
  walked_at        timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS canvas_sweeps_company_idx ON canvas_sweeps(company_id);
CREATE INDEX IF NOT EXISTS canvas_sweeps_territory_idx ON canvas_sweeps(territory_id);
CREATE INDEX IF NOT EXISTS canvas_sweeps_walked_at_idx ON canvas_sweeps(walked_at DESC);

ALTER TABLE canvas_sweeps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co" ON canvas_sweeps
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
