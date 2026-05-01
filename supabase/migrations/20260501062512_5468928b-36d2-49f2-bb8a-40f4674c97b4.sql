-- Strict pipeline separation: Sale vs Rent
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deal_type text NOT NULL DEFAULT 'sale';

-- Constrain to the two allowed values
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_deal_type_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_deal_type_check CHECK (deal_type IN ('sale', 'rent'));

-- Backfill from existing preferences.listing_type where present
UPDATE public.leads
SET deal_type = preferences->>'listing_type'
WHERE preferences ? 'listing_type'
  AND preferences->>'listing_type' IN ('sale', 'rent')
  AND deal_type IS DISTINCT FROM preferences->>'listing_type';

-- Index for fast pipeline filtering
CREATE INDEX IF NOT EXISTS idx_leads_deal_type ON public.leads (deal_type);

COMMENT ON COLUMN public.leads.deal_type IS 'Pipeline separation: sale | rent. Drives Deal Room view, AI rules (e.g. no mortgages for rent), and Add Lead form fields.';