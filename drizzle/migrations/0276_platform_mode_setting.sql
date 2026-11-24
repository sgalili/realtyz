CREATE TABLE public.platform_system_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  platform_mode text NOT NULL DEFAULT 'brokers_only' CHECK (platform_mode IN ('brokers_only','full_marketplace')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.platform_system_settings TO anon, authenticated;
GRANT UPDATE ON public.platform_system_settings TO authenticated;
GRANT ALL ON public.platform_system_settings TO service_role;
ALTER TABLE public.platform_system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads platform mode" ON public.platform_system_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Super admins update platform mode" ON public.platform_system_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
INSERT INTO public.platform_system_settings (id) VALUES (true) ON CONFLICT DO NOTHING;