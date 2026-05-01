CREATE TABLE public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  source text NOT NULL,
  message text NOT NULL,
  stack text,
  context jsonb DEFAULT '{}'::jsonb,
  url text,
  severity text NOT NULL DEFAULT 'error',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read error_logs"
  ON public.error_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can insert error_logs"
  ON public.error_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL OR auth.uid() IS NULL);

CREATE INDEX idx_error_logs_created_at ON public.error_logs (created_at DESC);
CREATE INDEX idx_error_logs_source ON public.error_logs (source);
CREATE INDEX idx_error_logs_severity ON public.error_logs (severity);