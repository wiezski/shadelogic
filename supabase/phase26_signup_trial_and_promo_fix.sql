-- Phase 26 — Signup flow bugs fix
--
-- Two issues caught during post-launch audit (2026-04-21):
--
-- 1. Companies created via /signup had plan='trial' but trial_ends_at=null.
--    This broke the billing-page countdown and silently removed trial
--    enforcement. Fix: default trial_ends_at to now() + 14 days so every
--    new trial company gets a proper window without app-level wiring.
--
-- 2. promo_codes had RLS enabled with a SELECT policy but no UPDATE policy,
--    meaning the "redeem code" UPDATE in signup was blocked. Any user
--    signing up with a valid promo code got the account but the code was
--    never marked used. Fix: authenticated users can UPDATE a promo code
--    if it's unused AND they can only tie it to their own company.

ALTER TABLE companies
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');

-- Defensive backfill for any existing trial company without an end date.
UPDATE companies
SET trial_ends_at = now() + interval '14 days'
WHERE plan = 'trial' AND trial_ends_at IS NULL;

CREATE POLICY promo_codes_redeem ON promo_codes
  FOR UPDATE TO authenticated
  USING (used_by_company IS NULL)
  WITH CHECK (
    used_by_company = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
