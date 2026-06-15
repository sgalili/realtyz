
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS project_name text;
CREATE INDEX IF NOT EXISTS listings_project_name_idx ON public.listings (project_name) WHERE project_name IS NOT NULL;

-- Backfill: any address containing 'טבנקין' belongs to the רביבים project.
UPDATE public.listings
SET project_name = 'רביבים'
WHERE project_name IS NULL
  AND (
    COALESCE(address, '') ILIKE '%טבנקין%'
    OR COALESCE(property_title, '') ILIKE '%טבנקין%'
    OR COALESCE(description, '') ILIKE '%רביבים%'
  );
