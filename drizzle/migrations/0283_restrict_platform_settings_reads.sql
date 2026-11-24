DROP POLICY IF EXISTS "Anyone reads platform mode" ON public.platform_system_settings;
CREATE POLICY "Super admins read platform settings" ON public.platform_system_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE OR REPLACE FUNCTION public.get_public_platform_settings()
RETURNS TABLE(platform_mode text, monthly_free_credits numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.platform_mode::text, s.monthly_free_credits::numeric FROM public.platform_system_settings s WHERE s.id = true
$$;
REVOKE ALL ON FUNCTION public.get_public_platform_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_platform_settings() TO anon, authenticated;