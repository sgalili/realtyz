CREATE UNIQUE INDEX IF NOT EXISTS listings_source_external_id_unique
ON public.listings (source, external_id)
WHERE external_id IS NOT NULL;