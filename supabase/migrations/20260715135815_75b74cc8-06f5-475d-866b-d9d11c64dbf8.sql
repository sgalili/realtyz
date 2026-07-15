ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS deal_type TEXT;
COMMENT ON COLUMN public.listings.deal_type IS 'Transaction type for listing: sale | rent | other. Mirrors leads.deal_type.';
CREATE INDEX IF NOT EXISTS listings_deal_type_idx ON public.listings(deal_type);
UPDATE public.listings
   SET deal_type = COALESCE(
     NULLIF(source_metadata->>'transaction_type',''),
     NULLIF(source_metadata->>'deal_type',''),
     'sale'
   )
 WHERE deal_type IS NULL;