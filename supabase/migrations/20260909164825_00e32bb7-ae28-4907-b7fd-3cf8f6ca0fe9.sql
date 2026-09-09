ALTER TABLE public.leads ALTER COLUMN assigned_to SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Authenticated users can insert leads" ON public.leads;

CREATE POLICY "Authenticated users can insert leads"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    assigned_to IS NULL
    OR assigned_to = auth.uid()
    OR public.shares_workspace_with(assigned_to, auth.uid())
    OR public.is_admin_or_above(auth.uid())
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;