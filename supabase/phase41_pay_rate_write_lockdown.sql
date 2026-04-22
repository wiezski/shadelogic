-- Phase 41 — Lock down WRITE access on pay_rates and contractor_rate_items to
-- role ∈ (owner, admin, accounting). Matches the UI gate added in the same
-- phase: the "manage_pay_rates" permission is default-on for owner/admin/
-- accounting and default-off for everyone else.
--
-- SELECT remains company-scoped for anyone with view_financials (enforced via
-- the existing tenant policies). UPDATE/INSERT/DELETE now require a
-- privileged role.

-- ── pay_rates ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pay_rates_insert" ON pay_rates;
CREATE POLICY "pay_rates_insert" ON pay_rates
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','accounting')
    )
  );

DROP POLICY IF EXISTS "pay_rates_update" ON pay_rates;
CREATE POLICY "pay_rates_update" ON pay_rates
  FOR UPDATE TO authenticated
  USING (
    company_id = get_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','accounting')
    )
  )
  WITH CHECK (company_id = get_company_id());

DROP POLICY IF EXISTS "pay_rates_delete" ON pay_rates;
CREATE POLICY "pay_rates_delete" ON pay_rates
  FOR DELETE TO authenticated
  USING (
    company_id = get_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','accounting')
    )
  );

-- ── contractor_rate_items ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "contractor_rate_items_insert" ON contractor_rate_items;
CREATE POLICY "contractor_rate_items_insert" ON contractor_rate_items
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','accounting')
    )
  );

DROP POLICY IF EXISTS "contractor_rate_items_update" ON contractor_rate_items;
CREATE POLICY "contractor_rate_items_update" ON contractor_rate_items
  FOR UPDATE TO authenticated
  USING (
    company_id = get_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','accounting')
    )
  )
  WITH CHECK (company_id = get_company_id());

DROP POLICY IF EXISTS "contractor_rate_items_delete" ON contractor_rate_items;
CREATE POLICY "contractor_rate_items_delete" ON contractor_rate_items
  FOR DELETE TO authenticated
  USING (
    company_id = get_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','accounting')
    )
  );
