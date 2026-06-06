CREATE TABLE IF NOT EXISTS public.ai_drawer_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_drawer_history TO authenticated;
GRANT ALL ON public.ai_drawer_history TO service_role;
ALTER TABLE public.ai_drawer_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read ai_drawer_history" ON public.ai_drawer_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner write ai_drawer_history" ON public.ai_drawer_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner delete ai_drawer_history" ON public.ai_drawer_history FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_ai_drawer_history_user_created ON public.ai_drawer_history(user_id, created_at);