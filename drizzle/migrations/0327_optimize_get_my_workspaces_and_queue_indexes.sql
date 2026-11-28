CREATE OR REPLACE FUNCTION public.get_my_workspaces()
 RETURNS TABLE(workspace_owner_id uuid, user_id uuid, role text, workspace_name text, workspace_logo_url text, workspace_logo_square_url text, workspace_logo_landscape_url text, account_type text, last_accessed_at timestamp with time zone, owner_full_name text, owner_email text, owner_avatar_url text, owner_phone text, is_office boolean, is_self boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS MATERIALIZED (
    SELECT auth.uid() AS uid,
           public.is_admin_or_above(auth.uid()) AS adm,
           public.has_role(auth.uid(), 'super_admin'::app_role) AS sa
  ),
  scoped AS MATERIALIZED (
    SELECT wm.* FROM public.workspace_memberships wm, me
    WHERE wm.user_id = me.uid
    UNION ALL
    SELECT wm.* FROM public.workspace_memberships wm, me
    WHERE me.adm AND wm.user_id IS DISTINCT FROM me.uid
  ),
  devs AS MATERIALIZED (
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
    WHERE ur.role = 'developer'::app_role AND ur.user_id IN (SELECT s.workspace_owner_id FROM scoped s)
  )
  SELECT
    wm.workspace_owner_id,
    wm.user_id,
    wm.role,
    COALESCE(wl.agency_name, wm.workspace_name, p.full_name, p.email, 'Workspace') AS workspace_name,
    COALESCE(wl.landscape_logo_url, wl.logo_url, wm.workspace_logo_url) AS workspace_logo_url,
    COALESCE(wl.logo_url, wm.workspace_logo_url) AS workspace_logo_square_url,
    wl.landscape_logo_url AS workspace_logo_landscape_url,
    wm.account_type,
    wm.last_accessed_at,
    p.full_name AS owner_full_name,
    p.email AS owner_email,
    p.avatar_url AS owner_avatar_url,
    CASE WHEN wm.user_id = wm.workspace_owner_id OR me.sa THEN NULLIF(btrim(p.phone), '') END AS owner_phone,
    (
      (
        COALESCE(btrim(wl.agency_name), '') <> ''
        AND wl.agency_name !~* '\.(local|test|invalid)$'
        AND lower(btrim(wl.agency_name)) <> 'workspace'
      )
      OR COALESCE(btrim(wm.account_type), '') IN ('agency', 'developer')
      OR d.user_id IS NOT NULL
    ) AS is_office,
    (wm.workspace_owner_id = wm.user_id) AS is_self
  FROM scoped wm
  CROSS JOIN me
  LEFT JOIN public.profiles p ON p.id = wm.workspace_owner_id
  LEFT JOIN public.white_label_settings wl ON wl.user_id = wm.workspace_owner_id
  LEFT JOIN devs d ON d.user_id = wm.workspace_owner_id
  ORDER BY (wm.workspace_owner_id = me.uid) DESC, wm.last_accessed_at DESC NULLS LAST;
$function$;

CREATE INDEX IF NOT EXISTS broker_import_jobs_status_created ON public.broker_import_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS broker_import_jobs_created ON public.broker_import_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS broker_wa_scanner_jobs_status_updated ON public.broker_wa_scanner_jobs (status, updated_at);