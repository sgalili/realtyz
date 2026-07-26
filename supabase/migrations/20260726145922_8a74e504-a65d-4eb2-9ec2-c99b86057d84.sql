ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS available_from date,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS long_description text,
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS listings_created_at_desc_idx ON public.listings (created_at DESC);
CREATE INDEX IF NOT EXISTS listings_city_created_at_idx ON public.listings (city, created_at DESC);