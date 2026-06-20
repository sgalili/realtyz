CREATE UNIQUE INDEX IF NOT EXISTS listings_source_external_id_full_unique
ON public.listings (source, external_id);