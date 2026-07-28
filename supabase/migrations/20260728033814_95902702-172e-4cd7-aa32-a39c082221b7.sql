DROP POLICY IF EXISTS "Users manage own wa_providers" ON public.wa_providers;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_providers TO authenticated;
GRANT ALL ON public.wa_providers TO service_role;
ALTER TABLE public.wa_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace shares wa_providers"
ON public.wa_providers
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (wa_providers.user_id IS NOT NULL AND public.can_access_workspace_owner(wa_providers.user_id))
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (wa_providers.user_id IS NOT NULL AND public.can_access_workspace_owner(wa_providers.user_id))
);