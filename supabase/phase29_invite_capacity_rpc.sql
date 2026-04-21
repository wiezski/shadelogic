-- Phase 29 — SECURITY DEFINER RPC so the signup invite flow can check
-- whether a company is at/over its plan limit BEFORE the invitee has a
-- profile row (and thus can't pass tenant-scoped RLS to read company +
-- profile counts themselves).
--
-- Without this, over-limit invitees silently bypass the pending-approval
-- gate and join as active users, skipping the +$25/mo approval flow.
--
-- Must be callable by authenticated users (invitee has just signed up).
-- Returns a flat row so `.single()` on the client works cleanly.

CREATE OR REPLACE FUNCTION public.check_invite_capacity(p_company_id uuid)
RETURNS TABLE (
  plan text,
  current_users int,
  included_limit int,
  needs_approval boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_current int;
  v_limit int;
BEGIN
  -- Pull plan. Fall back to 'trial' if company missing or row not found.
  SELECT c.plan INTO v_plan FROM companies c WHERE c.id = p_company_id;
  IF v_plan IS NULL THEN
    v_plan := 'trial';
  END IF;

  -- Plan → included-user limit. Mirrors lib/features.ts PLAN_USER_LIMITS.
  v_limit := CASE v_plan
    WHEN 'starter'      THEN 1
    WHEN 'professional' THEN 3
    WHEN 'business'     THEN 5
    ELSE 3  -- trial + any unknown
  END;

  -- Count active members (status='active'). Excludes pending invitees.
  SELECT COUNT(*)::int INTO v_current
  FROM profiles p
  WHERE p.company_id = p_company_id AND p.status = 'active';

  RETURN QUERY SELECT
    v_plan,
    v_current,
    v_limit,
    (v_current >= v_limit) AS needs_approval;
END;
$$;

-- Allow anyone authenticated (including the invitee who has no profile yet)
-- to call the RPC. The function is self-contained and only returns counts;
-- no sensitive data leaks.
REVOKE ALL ON FUNCTION public.check_invite_capacity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_invite_capacity(uuid) TO authenticated;
