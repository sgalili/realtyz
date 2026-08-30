CREATE TABLE IF NOT EXISTS public.workspace_sms_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT '019',
  username text,
  password text,
  sender_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_sms_settings TO authenticated;
GRANT ALL ON public.workspace_sms_settings TO service_role;

ALTER TABLE public.workspace_sms_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their workspace SMS settings"
ON public.workspace_sms_settings FOR ALL TO authenticated
USING (workspace_owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (workspace_owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_workspace_sms_settings_updated_at
BEFORE UPDATE ON public.workspace_sms_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();