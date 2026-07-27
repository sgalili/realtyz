ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS house_number text,
  ADD COLUMN IF NOT EXISTS apartment_number text;

CREATE INDEX IF NOT EXISTS idx_listings_house_number ON public.listings (house_number);