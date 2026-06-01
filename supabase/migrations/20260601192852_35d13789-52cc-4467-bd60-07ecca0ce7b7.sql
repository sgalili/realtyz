-- Allow super_admin to also read api_configs (currently admin-only).
DROP POLICY IF EXISTS "Admins can read api_configs" ON public.api_configs;
CREATE POLICY "Admins can read api_configs"
ON public.api_configs FOR SELECT
USING (public.is_admin_or_above(auth.uid()));