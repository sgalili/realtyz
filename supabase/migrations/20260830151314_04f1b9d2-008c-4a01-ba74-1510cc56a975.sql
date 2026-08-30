-- Workspace-scoped effective Facebook Page lookup: any member (or super admin)
-- of the workspace resolves the SAME page binding, without depending on the
-- asynchronously-persisted profiles.active_workspace_owner_id value.
CREATE OR REPLACE FUNCTION public.get_effective_meta_page(_owner uuid)
RETURNS TABLE(page_id text, page_name text, page_avatar_url text, has_token boolean, is_shared boolean, owner_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _target uuid := _owner;
BEGIN
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  IF _target IS NULL OR NOT public.can_access_workspace_owner(_target) THEN
    SELECT COALESCE(p.active_workspace_owner_id, _uid) INTO _target
      FROM public.profiles p WHERE p.id = _uid;
    _target := COALESCE(_target, _uid);
  END IF;

  RETURN QUERY
  SELECT b.page_id::text, b.page_name::text, b.page_avatar_url::text,
         length(COALESCE(b.page_access_token, '')) > 30, false, b.owner_id
    FROM public.messenger_page_bindings b
   WHERE b.owner_id = _target
   ORDER BY COALESCE(b.is_selected, false) DESC, b.updated_at DESC
   LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_effective_meta_page(uuid) TO authenticated, service_role;

-- Every workspace member (not just the owner) may pick / update / remove the
-- workspace's Page bindings, so shared Facebook accounts are usable by all.
DROP POLICY IF EXISTS "workspace members write page bindings" ON public.messenger_page_bindings;
CREATE POLICY "workspace members write page bindings"
ON public.messenger_page_bindings
FOR UPDATE
TO authenticated
USING (public.can_access_workspace_owner(owner_id))
WITH CHECK (public.can_access_workspace_owner(owner_id));

DROP POLICY IF EXISTS "workspace members insert page bindings" ON public.messenger_page_bindings;
CREATE POLICY "workspace members insert page bindings"
ON public.messenger_page_bindings
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_workspace_owner(owner_id));

DROP POLICY IF EXISTS "workspace members delete page bindings" ON public.messenger_page_bindings;
CREATE POLICY "workspace members delete page bindings"
ON public.messenger_page_bindings
FOR DELETE
TO authenticated
USING (public.can_access_workspace_owner(owner_id));

-- Members may also refresh the shared personal-profile connection metadata.
DROP POLICY IF EXISTS "workspace members update fb personal connection" ON public.fb_personal_connections;
CREATE POLICY "workspace members update fb personal connection"
ON public.fb_personal_connections
FOR UPDATE
TO authenticated
USING (public.can_access_workspace_owner(workspace_owner_id))
WITH CHECK (public.can_access_workspace_owner(workspace_owner_id));