-- Keep only the newest row per (created_by, platform)
DELETE FROM public.social_connections sc
USING public.social_connections keep
WHERE sc.id <> keep.id
  AND sc.platform = keep.platform
  AND sc.created_by IS NOT DISTINCT FROM keep.created_by
  AND (keep.updated_at, keep.created_at, keep.id) > (sc.updated_at, sc.created_at, sc.id);

ALTER TABLE public.social_connections DROP CONSTRAINT IF EXISTS social_connections_platform_key;
DROP INDEX IF EXISTS public.social_connections_platform_key;

CREATE UNIQUE INDEX IF NOT EXISTS social_connections_owner_platform_key
  ON public.social_connections (created_by, platform);