CREATE TABLE public.feedback_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  surface TEXT NOT NULL DEFAULT 'deal_room',
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  ai_message TEXT NOT NULL,
  suggested_correction TEXT,
  lead_id UUID,
  suggestion_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_logs_user_created ON public.feedback_logs(user_id, created_at DESC);
CREATE INDEX idx_feedback_logs_rating ON public.feedback_logs(rating, created_at DESC);

ALTER TABLE public.feedback_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own feedback_logs"
  ON public.feedback_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users view own feedback_logs"
  ON public.feedback_logs
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins delete feedback_logs"
  ON public.feedback_logs
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
