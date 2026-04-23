-- Phase 48 — Helper RPC for the admin bootstrap endpoint.
--
-- Supabase's auth.admin.listUsers() intermittently fails with
-- "Database error finding users" even when the service-role key is
-- correct. This RPC sidesteps that by querying auth.users directly
-- via SECURITY DEFINER. Service-role only — public can't enumerate.

CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) TO service_role;

COMMENT ON FUNCTION public.get_auth_user_id_by_email(TEXT) IS
  'Returns the auth.users.id for a given email, or NULL if not found. Service-role only — used by /api/admin/bootstrap to sidestep listUsers() flakiness.';
