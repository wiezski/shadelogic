-- Phase 42 — Repair storage.objects policies for the canvas-maps bucket.
-- Symptom: uploading a territory map from /canvas/[id] failed with
-- "new row violates row-level security policy". Likely cause: .upload()
-- returns the inserted row, which requires a SELECT policy; the bucket
-- only had INSERT/UPDATE/DELETE policies, no SELECT, and that can surface
-- as an INSERT rejection depending on the REST path used.
--
-- Clean slate: drop existing canvas-maps policies and recreate a full set
-- (SELECT/INSERT/UPDATE/DELETE). Bucket is public, so direct-URL reads are
-- unaffected.

DROP POLICY IF EXISTS "auth can upload canvas maps" ON storage.objects;
DROP POLICY IF EXISTS "auth can update canvas maps" ON storage.objects;
DROP POLICY IF EXISTS "auth can delete canvas maps" ON storage.objects;
DROP POLICY IF EXISTS "auth can read canvas maps" ON storage.objects;
DROP POLICY IF EXISTS "public can read canvas maps" ON storage.objects;

CREATE POLICY "public can read canvas maps"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'canvas-maps');

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
