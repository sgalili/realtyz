CREATE TABLE IF NOT EXISTS public.lead_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'interested',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, listing_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_listings TO authenticated;
GRANT ALL ON public.lead_listings TO service_role;

ALTER TABLE public.lead_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage lead-listing links"
ON public.lead_listings FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_listings.lead_id)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_listings.lead_id)
);

CREATE INDEX IF NOT EXISTS lead_listings_lead_idx ON public.lead_listings(lead_id);
CREATE INDEX IF NOT EXISTS lead_listings_listing_idx ON public.lead_listings(listing_id);

CREATE TRIGGER lead_listings_touch_updated_at
BEFORE UPDATE ON public.lead_listings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();