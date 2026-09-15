-- 1. every row belongs to a workspace
UPDATE public.social_connections
SET workspace_owner_id = created_by
WHERE workspace_owner_id IS NULL AND created_by IS NOT NULL;

-- 2. drop duplicates per (workspace, platform), keeping the live/newest row
DELETE FROM public.social_connections s
USING public.social_connections k
WHERE s.workspace_owner_id IS NOT NULL
  AND s.workspace_owner_id = k.workspace_owner_id
  AND s.platform = k.platform
  AND s.id <> k.id
  AND (
    (k.is_connected, COALESCE(k.connected_at, k.created_at), k.id)
    > (s.is_connected, COALESCE(s.connected_at, s.created_at), s.id)
  );

-- 3. uniqueness is per WORKSPACE, not per user
DROP INDEX IF EXISTS public.social_connections_owner_platform_key;
CREATE UNIQUE INDEX IF NOT EXISTS social_connections_ws_platform_key
  ON public.social_connections (workspace_owner_id, platform);