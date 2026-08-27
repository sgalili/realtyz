DROP POLICY IF EXISTS "owner reads own page bindings" ON public.messenger_page_bindings;
CREATE POLICY "workspace members read page bindings"
ON public.messenger_page_bindings
FOR SELECT
TO authenticated
USING (public.can_access_workspace_owner(owner_id));

DROP POLICY IF EXISTS "owner writes own page bindings" ON public.messenger_page_bindings;
CREATE POLICY "workspace owners write page bindings"
ON public.messenger_page_bindings
FOR ALL
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);