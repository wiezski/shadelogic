-- Phase 36 — Canvassing v2
--
-- Four new concepts on canvas_territories:
--   1) assigned_to              — the canvasser (FK profiles; null = unassigned / anyone)
--   2) start_address/lat/lng    — the boss-provided starting point
--   3) campaign + materials_used — what marketing push this territory is part of
--   4) recanvass_interval_days  — cadence to circle back (null = one-time)

ALTER TABLE canvas_territories
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_address text,
  ADD COLUMN IF NOT EXISTS start_lat numeric,
  ADD COLUMN IF NOT EXISTS start_lng numeric,
  ADD COLUMN IF NOT EXISTS campaign text,
  ADD COLUMN IF NOT EXISTS materials_used text,
  ADD COLUMN IF NOT EXISTS recanvass_interval_days integer;
