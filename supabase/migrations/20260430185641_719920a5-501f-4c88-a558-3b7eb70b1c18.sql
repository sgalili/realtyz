-- WhatsApp gateway router configuration
CREATE TABLE IF NOT EXISTS public.wa_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider_name text NOT NULL CHECK (provider_name IN ('WBA', 'GreenAPI')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_official boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_providers_user ON public.wa_providers(user_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_providers_user_provider ON public.wa_providers(user_id, provider_name);

ALTER TABLE public.wa_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wa_providers"
  ON public.wa_providers FOR ALL TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_wa_providers_updated_at
  BEFORE UPDATE ON public.wa_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();