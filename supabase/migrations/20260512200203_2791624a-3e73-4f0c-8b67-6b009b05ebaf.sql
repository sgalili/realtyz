-- 1. Source enum
DO $$ BEGIN
  CREATE TYPE public.listing_source AS ENUM ('yad2', 'madlan', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. New columns on listings
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS source public.listing_source NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS is_investment_opportunity boolean NOT NULL DEFAULT false;

-- 3. Unique constraint on source_url (NULLs allowed; only enforced when present)
CREATE UNIQUE INDEX IF NOT EXISTS listings_source_url_unique
  ON public.listings (source_url)
  WHERE source_url IS NOT NULL;

-- Helpful lookup index for external_id per source
CREATE INDEX IF NOT EXISTS listings_source_external_id_idx
  ON public.listings (source, external_id)
  WHERE external_id IS NOT NULL;

-- 4. Duplicate-protection trigger (clear error message on collision)
CREATE OR REPLACE FUNCTION public.prevent_duplicate_listing_source_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.source_url IS NULL OR length(trim(NEW.source_url)) = 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.listings
    WHERE source_url = NEW.source_url
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'Duplicate listing: source_url % already exists', NEW.source_url
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_listing_source_url ON public.listings;
CREATE TRIGGER trg_prevent_duplicate_listing_source_url
  BEFORE INSERT OR UPDATE OF source_url ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_listing_source_url();

-- 5. Enable realtime on listings
ALTER TABLE public.listings REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.listings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
