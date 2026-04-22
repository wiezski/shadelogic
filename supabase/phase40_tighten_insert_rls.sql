-- Phase 40 — Tighten permissive `WITH CHECK (true)` INSERT policies on
-- internal tables so authenticated users can only INSERT rows that belong
-- to their own company. The parallel SELECT/UPDATE/DELETE policies were
-- already tenant-scoped; these INSERT policies were left open.
--
-- Covered: invoices, invoice_line_items, payments, payment_integrations,
-- install_checklist_items, install_checklist_completions, manufacturer_specs.
--
-- Anon-facing INSERTs (activity_log.anon_log, customers.anon_lead,
-- builder_messages.builder_messages_portal_insert, quotes.anon_sign) are
-- left permissive intentionally — they back legitimate customer-facing
-- public forms. Tightening them would require token validation mid-request,
-- which is a larger refactor.

DROP POLICY IF EXISTS "invoices_insert" ON invoices;
CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_company_id());

DROP POLICY IF EXISTS "invoice_line_items_insert" ON invoice_line_items;
CREATE POLICY "invoice_line_items_insert" ON invoice_line_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_line_items.invoice_id
        AND invoices.company_id = get_company_id()
    )
  );

DROP POLICY IF EXISTS "payments_insert" ON payments;
CREATE POLICY "payments_insert" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_company_id());

DROP POLICY IF EXISTS "payment_integrations_insert" ON payment_integrations;
CREATE POLICY "payment_integrations_insert" ON payment_integrations
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_company_id());

DROP POLICY IF EXISTS "install_checklist_items_insert" ON install_checklist_items;
CREATE POLICY "install_checklist_items_insert" ON install_checklist_items
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_company_id());

DROP POLICY IF EXISTS "install_checklist_completions_insert" ON install_checklist_completions;
CREATE POLICY "install_checklist_completions_insert" ON install_checklist_completions
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_company_id());

DROP POLICY IF EXISTS "manufacturer_specs_write_auth" ON manufacturer_specs;
CREATE POLICY "manufacturer_specs_write_admin" ON manufacturer_specs
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin'))
  );
