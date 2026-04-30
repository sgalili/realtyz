CREATE TABLE public.platform_oauth_apps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL UNIQUE,
  client_id TEXT,
  client_secret TEXT,
  notes TEXT,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_oauth_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view platform_oauth_apps"
  ON public.platform_oauth_apps FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins insert platform_oauth_apps"
  ON public.platform_oauth_apps FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins update platform_oauth_apps"
  ON public.platform_oauth_apps FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins delete platform_oauth_apps"
  ON public.platform_oauth_apps FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER set_updated_at_platform_oauth_apps
  BEFORE UPDATE ON public.platform_oauth_apps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();