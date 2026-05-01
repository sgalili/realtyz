CREATE TABLE public.agent_personas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  tone TEXT NOT NULL DEFAULT 'professional',
  tone_custom TEXT,
  professional_bio TEXT,
  selling_philosophy TEXT,
  signature TEXT,
  language TEXT NOT NULL DEFAULT 'he',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_personas_tone_check CHECK (tone IN ('professional','friendly','urgent','conservative','custom'))
);

ALTER TABLE public.agent_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agent_personas"
  ON public.agent_personas
  FOR ALL
  TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_agent_personas_updated_at
  BEFORE UPDATE ON public.agent_personas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();