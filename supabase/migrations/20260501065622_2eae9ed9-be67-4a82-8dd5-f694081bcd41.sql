
-- Hyper-Local Real Estate Expert: agent service areas + property location columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS service_areas text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS neighborhood text;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS neighborhood text;

CREATE INDEX IF NOT EXISTS idx_leads_neighborhood ON public.leads(neighborhood);
CREATE INDEX IF NOT EXISTS idx_listings_city ON public.listings(city);
CREATE INDEX IF NOT EXISTS idx_listings_neighborhood ON public.listings(neighborhood);
