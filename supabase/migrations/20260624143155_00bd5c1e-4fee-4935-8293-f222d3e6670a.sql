DROP POLICY IF EXISTS "Users can delete own listings" ON public.listings;

CREATE POLICY "Users and managers can delete listings"
ON public.listings
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'managing_broker'::app_role)
  OR public.has_role(auth.uid(), 'lead_agent'::app_role)
  OR public.has_role(auth.uid(), 'agent'::app_role)
);