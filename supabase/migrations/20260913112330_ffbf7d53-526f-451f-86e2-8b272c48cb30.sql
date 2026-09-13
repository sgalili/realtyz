CREATE OR REPLACE FUNCTION public.set_active_workspace(_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_memberships
    WHERE user_id = uid AND workspace_owner_id = _owner
  ) THEN
    -- Admins / super admins may switch into any existing account's workspace.
    IF public.is_admin_or_above(uid) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _owner) THEN
      INSERT INTO public.workspace_memberships (workspace_owner_id, user_id, role, last_accessed_at)
      VALUES (_owner, uid, 'super_admin', now())
      ON CONFLICT (workspace_owner_id, user_id) DO UPDATE SET last_accessed_at = now();
    ELSE
      RAISE EXCEPTION 'not a member of this workspace';
    END IF;
  END IF;

  UPDATE public.workspace_memberships
  SET last_accessed_at = now()
  WHERE user_id = uid AND workspace_owner_id = _owner;

  UPDATE public.profiles
  SET active_workspace_owner_id = _owner
  WHERE id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_workspace(uuid) TO authenticated;