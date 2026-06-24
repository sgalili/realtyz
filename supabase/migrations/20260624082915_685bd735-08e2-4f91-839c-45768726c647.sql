ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS linked_listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_linked_listing_id ON public.leads(linked_listing_id);