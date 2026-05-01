
-- Compliance Guardrails: escalation queue for high-risk prospect messages
CREATE TABLE IF NOT EXISTS public.escalation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid,
  trigger_category text NOT NULL,         -- legal | financial | guarantee | discrimination | other
  trigger_keywords text[] NOT NULL DEFAULT '{}',
  severity text NOT NULL DEFAULT 'high',  -- high | medium
  prospect_message text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'open',    -- open | acknowledged | resolved
  notified_agent boolean NOT NULL DEFAULT false,
  notification_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_escalation_user_status_created
  ON public.escalation_alerts(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escalation_lead
  ON public.escalation_alerts(lead_id);

ALTER TABLE public.escalation_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own escalation_alerts"
  ON public.escalation_alerts
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
