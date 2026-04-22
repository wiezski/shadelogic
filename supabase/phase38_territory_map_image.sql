-- Phase 38 — Map image on a canvas territory.
-- Owner uploads an annotated screenshot (a map with streets highlighted)
-- so the canvasser has a clear visual of where to walk.
--
-- Also creates the canvas-maps public storage bucket with RLS.

ALTER TABLE canvas_territories
  ADD COLUMN IF NOT EXISTS map_image_url text;

-- canvas-maps public bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('canvas-maps', 'canvas-maps', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth can upload canvas maps"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'canvas-maps');

CREATE POLICY "auth can update canvas maps"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'canvas-maps')
  WITH CHECK (bucket_id = 'canvas-maps');

CREATE POLICY "auth can delete canvas maps"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'canvas-maps');
