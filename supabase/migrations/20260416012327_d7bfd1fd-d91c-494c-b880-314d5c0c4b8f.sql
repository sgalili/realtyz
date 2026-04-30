
CREATE TABLE public.campaign_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read campaign_settings"
ON public.campaign_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can insert campaign_settings"
ON public.campaign_settings FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update campaign_settings"
ON public.campaign_settings FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete campaign_settings"
ON public.campaign_settings FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed default values
INSERT INTO public.campaign_settings (key, value) VALUES
  ('ai_tone', 'warm_friendly'),
  ('current_focus', '');
