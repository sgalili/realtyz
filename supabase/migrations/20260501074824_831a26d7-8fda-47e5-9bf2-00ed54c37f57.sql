ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS extracted_from_lead_id uuid,
  ADD COLUMN IF NOT EXISTS extracted_from_message_id uuid,
  ADD COLUMN IF NOT EXISTS extraction_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS rooms numeric(4,1),
  ADD COLUMN IF NOT EXISTS sqm integer,
  ADD COLUMN IF NOT EXISTS floor integer,
  ADD COLUMN IF NOT EXISTS parking boolean,
  ADD COLUMN IF NOT EXISTS elevator boolean;

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_status_check
  CHECK (status IN ('pending', 'live', 'discarded'));

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_source_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_source_check
  CHECK (source IN ('manual', 'ai_extraction', 'import'));

CREATE INDEX IF NOT EXISTS idx_listings_user_status
  ON public.listings (user_id, status);

CREATE INDEX IF NOT EXISTS idx_listings_extracted_lead
  ON public.listings (extracted_from_lead_id)
  WHERE extracted_from_lead_id IS NOT NULL;

-- Tighten the public-read policy so anonymous visitors never see a pending row.
DROP POLICY IF EXISTS "Public can view published listings" ON public.listings;
CREATE POLICY "Public can view published listings"
  ON public.listings
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true AND status = 'live');