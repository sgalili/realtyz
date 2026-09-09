ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS agency_name text,
  ADD COLUMN IF NOT EXISTS operating_area text,
  ADD COLUMN IF NOT EXISTS notes text;