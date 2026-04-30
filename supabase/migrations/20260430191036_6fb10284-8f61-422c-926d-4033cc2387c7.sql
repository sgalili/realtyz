
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  step int NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 3),
  is_complete boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','finished','skipped')),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own onboarding"
  ON public.onboarding_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'super_admin'::app_role));

CREATE POLICY "Users insert own onboarding"
  ON public.onboarding_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own onboarding"
  ON public.onboarding_progress FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(),'super_admin'::app_role));

CREATE TRIGGER trg_onboarding_progress_updated_at
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
