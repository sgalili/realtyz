
CREATE TABLE public.test_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blast_name text NOT NULL,
  message_body text NOT NULL,
  total_recipients integer NOT NULL DEFAULT 0,
  simulated_cost numeric(10,2) NOT NULL DEFAULT 0,
  created_by uuid,
  status text NOT NULL DEFAULT 'simulated',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read test_logs"
  ON public.test_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert test_logs"
  ON public.test_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
