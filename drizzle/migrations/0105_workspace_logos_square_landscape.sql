DROP FUNCTION IF EXISTS public.get_my_workspaces();

CREATE FUNCTION public.get_my_workspaces()
RETURNS TABLE(
  workspace_owner_id uuid,
  user_id uuid,
  role text,
  workspace_name text,
  workspace_logo_url text,
  workspace_logo_square_url text,
  workspace_logo_landscape_url text,
  account_type text,
  last_accessed_at timestamp with time zone,
  owner_full_name text,
  owner_email text,
  owner_avatar_url text,
  owner_phone text,
  is_office boolean,
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
    -- Separate logo variants so account cards can prefer the square logo and
    -- fall back to the rectangular one before any personal photo.
    COALESCE(wl.logo_url, wm.workspace_logo_url) AS workspace_logo_square_url,
    wl.landscape_logo_url AS workspace_logo_landscape_url,
    wm.account_type,
    wm.last_accessed_at,
    p.full_name AS owner_full_name,
    p.email AS owner_email,
    p.avatar_url AS owner_avatar_url,
    -- A private person's mobile is only ever read back by the owner themselves
    -- or by a platform super admin; team members keep seeing the name/email line.
    CASE
      WHEN wm.user_id = wm.workspace_owner_id
        OR public.has_role(auth.uid(), 'super_admin'::app_role)
      THEN NULLIF(btrim(p.phone), '')
    END AS owner_phone,
    -- Real office/company/agency branding (or a company account type) keeps its
    -- own name as the workspace title; anything else is a single person.
    (
      (
        COALESCE(btrim(wl.agency_name), '') <> ''
        AND wl.agency_name !~* '\.(local|test|invalid)$'
        AND lower(btrim(wl.agency_name)) <> 'workspace'
      )
      OR COALESCE(btrim(wm.account_type), '') IN ('agency', 'developer')
      OR public.has_role(wm.workspace_owner_id, 'developer'::app_role)
    ) AS is_office,
    (wm.workspace_owner_id = wm.user_id) AS is_self
  FROM public.workspace_memberships wm
  LEFT JOIN public.profiles p ON p.id = wm.workspace_owner_id
  LEFT JOIN public.white_label_settings wl ON wl.user_id = wm.workspace_owner_id
  WHERE wm.user_id = auth.uid()
     OR public.is_admin_or_above(auth.uid())
  ORDER BY (wm.workspace_owner_id = auth.uid()) DESC, wm.last_accessed_at DESC NULLS LAST;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_workspaces() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_workspaces() TO service_role;