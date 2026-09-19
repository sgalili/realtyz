CREATE POLICY "Private owners read interest in their listings"
  ON public.public_listing_interest FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = public_listing_interest.listing_id
      AND l.owner_id = auth.uid()
  ));