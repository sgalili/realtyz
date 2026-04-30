
DROP POLICY IF EXISTS "Anyone can read tracking links" ON public.tracking_links;

CREATE POLICY "Authenticated users can read tracking links"
ON public.tracking_links FOR SELECT TO authenticated
USING (true);
