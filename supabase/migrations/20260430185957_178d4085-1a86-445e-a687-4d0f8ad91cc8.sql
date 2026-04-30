ALTER TABLE public.wa_providers
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE public.wa_providers
  ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_providers_tenant
  ON public.wa_providers(tenant_id, is_active);

-- Refresh the policy so rows with NULL user_id (tenant-only) are still admin-manageable.
DROP POLICY IF EXISTS "Users manage own wa_providers" ON public.wa_providers;
CREATE POLICY "Users manage own wa_providers"
  ON public.wa_providers FOR ALL TO authenticated
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );