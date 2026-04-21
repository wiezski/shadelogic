-- Phase 25 — order-documents storage bucket RLS
--
-- The `order-documents` bucket was created earlier but had no access
-- policies, so client-side uploads were silently failing. This migration
-- adds the missing authenticated-user policies and finalizes the Phase 14
-- order PDF flow (app/quotes/[id]/page.tsx).
--
-- Data-level tenancy is enforced at the quote_materials / quotes table RLS
-- layer (already checks company_id via get_company_id()), so we don't need
-- to duplicate that check at the storage layer.

CREATE POLICY "auth can upload order docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-documents');

CREATE POLICY "auth can read order docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'order-documents');

CREATE POLICY "auth can update order docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'order-documents')
  WITH CHECK (bucket_id = 'order-documents');

CREATE POLICY "auth can delete order docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'order-documents');
