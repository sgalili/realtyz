-- Workspace members must be able to read the workspace owner's branding.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'white_label_settings'
      AND policyname = 'Workspace members can view owner branding'
  ) THEN
    CREATE POLICY "Workspace members can view owner branding"
    ON public.white_label_settings
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.workspace_memberships wm
        WHERE wm.workspace_owner_id = white_label_settings.user_id
          AND wm.user_id = auth.uid()
      )
      OR public.is_admin_or_above(auth.uid())
    );
  END IF;
END $$;

-- Realtime uses the table's SELECT policy to decide whether to deliver row changes.
-- The old engagement_events SELECT policy only allowed the owner/admin, so workspace
-- members could subscribe successfully but receive no live comment/reply payloads.
DROP POLICY IF EXISTS "engagement_events: owner read" ON public.engagement_events;
CREATE POLICY "engagement_events: workspace read"
ON public.engagement_events
FOR SELECT
TO authenticated
USING (
  public.can_access_workspace_owner(user_id)
  OR public.is_admin_or_above(auth.uid())
);

-- Keep the table in the realtime publication and full-row identity for updates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'engagement_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.engagement_events;
  END IF;
END $$;
ALTER TABLE public.engagement_events REPLICA IDENTITY FULL;

-- Return complete workspace display data for tenants/managers from the owner branding row.
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
    COALESCE(wl.logo_url, wm.workspace_logo_url, p.avatar_url) AS workspace_logo_url,
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