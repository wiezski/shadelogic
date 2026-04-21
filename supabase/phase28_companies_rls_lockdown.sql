-- Phase 28 — Lock down `companies` table RLS.
--
-- The companies table contained twilio_auth_token, stripe_customer_id,
-- stripe_subscription_id, stripe_connect_account_id — live secrets and
-- billing identifiers — with RLS DISABLED. Any authenticated user could
-- read or modify any tenant's row. Now scoped to tenant + owner role.
--
-- Signup was modified (app/signup/page.tsx) to generate the company UUID
-- client-side so it doesn't need a SELECT-back round-trip after INSERT,
-- keeping the strict SELECT policy workable.

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- INSERT: any authenticated user can create a new company (they'll tie
-- themselves to it with a profile row inserted immediately after).
CREATE POLICY "companies_insert_auth"
  ON companies FOR INSERT TO authenticated
  WITH CHECK (true);

-- SELECT: only your own company.
CREATE POLICY "companies_select_own"
  ON companies FOR SELECT TO authenticated
  USING (
    id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- UPDATE: only your own company, only if you're the owner.
CREATE POLICY "companies_update_owner"
  ON companies FOR UPDATE TO authenticated
  USING (
    id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND 'owner' = (SELECT role FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND 'owner' = (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- No DELETE policy = no one can delete via RLS. If absolutely needed,
-- do it via SQL admin.

-- Note: `product_changes` (SELECT with qual=true) was audited and left alone
-- — it's a global product-catalog metadata table with no company_id column,
-- intentionally shared across tenants.
--
-- `company_settings.anon_co` (anon SELECT qual=true) was also left as-is
-- for now — public quote/invoice/builder pages need to read branding info
-- via the anon key. Proper fix is a column-scoped view or token-gated RPC
-- that exposes only safe branding columns. Deferred.
