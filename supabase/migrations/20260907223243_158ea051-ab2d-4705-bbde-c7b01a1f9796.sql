CREATE OR REPLACE FUNCTION public.get_my_workspaces()
RETURNS TABLE(
  workspace_owner_id uuid,
  user_id uuid,
  role text,
  workspace_name text,
  workspace_logo_url text,
  account_type text,
  last_accessed_at timestamp with time zone,
  owner_full_name text,
  owner_email text,
  owner_avatar_url text,
  is_self boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    wm.workspace_owner_id,
    wm.user_id,
    wm.role,
    COALESCE(wl.agency_name, wm.workspace_name, p.full_name, p.email, 'Workspace') AS workspace_name,
    -- Office logo ONLY: landscape, then square, then the stored membership logo.
    -- The owner's personal avatar is NEVER used as the workspace logo.
    COALESCE(wl.landscape_logo_url, wl.logo_url, wm.workspace_logo_url) AS workspace_logo_url,
    wm.account_type,
    wm.last_accessed_at,
    p.full_name AS owner_full_name,
    p.email AS owner_email,
    p.avatar_url AS owner_avatar_url,
    (wm.workspace_owner_id = wm.user_id) AS is_self
  FROM public.workspace_memberships wm
  LEFT JOIN public.profiles p ON p.id = wm.workspace_owner_id
  LEFT JOIN public.white_label_settings wl ON wl.user_id = wm.workspace_owner_id
  WHERE wm.user_id = auth.uid()
     OR public.is_admin_or_above(auth.uid())
  ORDER BY (wm.workspace_owner_id = auth.uid()) DESC, wm.last_accessed_at DESC NULLS LAST;
$function$;