-- Usage logs table
CREATE TABLE public.usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  service_type TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  cost NUMERIC NOT NULL DEFAULT 0,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_user_created ON public.usage_logs(user_id, created_at DESC);
CREATE INDEX idx_usage_logs_user_service_demo ON public.usage_logs(user_id, service_type, is_demo, created_at DESC);

ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own usage_logs"
  ON public.usage_logs
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users insert own usage_logs"
  ON public.usage_logs
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins delete usage_logs"
  ON public.usage_logs
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Monthly aggregated view (current month, partitioned by is_demo)
CREATE OR REPLACE VIEW public.usage_monthly_summary
WITH (security_invoker = true)
AS
SELECT
  user_id,
  service_type,
  is_demo,
  date_trunc('month', created_at) AS month,
  SUM(quantity) AS total_quantity,
  SUM(cost) AS total_cost,
  COUNT(*) AS event_count
FROM public.usage_logs
GROUP BY user_id, service_type, is_demo, date_trunc('month', created_at);
