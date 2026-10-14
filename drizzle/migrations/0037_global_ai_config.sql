CREATE TABLE public.global_ai_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  master_prompt text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.global_ai_config TO authenticated;
GRANT ALL ON public.global_ai_config TO service_role;
ALTER TABLE public.global_ai_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins read global ai config" ON public.global_ai_config FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "super admins insert global ai config" ON public.global_ai_config FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "super admins update global ai config" ON public.global_ai_config FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
INSERT INTO public.global_ai_config (id) VALUES (true) ON CONFLICT DO NOTHING;