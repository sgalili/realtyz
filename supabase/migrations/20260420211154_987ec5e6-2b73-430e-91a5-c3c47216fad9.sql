CREATE POLICY "Users can create own social connections"
ON public.social_connections
FOR INSERT
TO authenticated
WITH CHECK ((created_by = auth.uid()) OR public.is_admin_or_above(auth.uid()));

CREATE POLICY "Users can view own social connections"
ON public.social_connections
FOR SELECT
TO authenticated
USING ((created_by = auth.uid()) OR public.is_admin_or_above(auth.uid()));

CREATE POLICY "Users can update own social connections"
ON public.social_connections
FOR UPDATE
TO authenticated
USING ((created_by = auth.uid()) OR public.is_admin_or_above(auth.uid()))
WITH CHECK ((created_by = auth.uid()) OR public.is_admin_or_above(auth.uid()));