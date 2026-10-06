DROP INDEX IF EXISTS public.listings_source_url_unique;
DROP INDEX IF EXISTS public.listings_source_external_id_unique;
DROP INDEX IF EXISTS public.listings_source_external_id_full_unique;
CREATE UNIQUE INDEX listings_workspace_source_url_unique ON public.listings(COALESCE(workspace_owner_id,user_id),source_url) WHERE source_url IS NOT NULL;
CREATE UNIQUE INDEX listings_workspace_source_external_unique ON public.listings(COALESCE(workspace_owner_id,user_id),source,external_id) WHERE external_id IS NOT NULL;