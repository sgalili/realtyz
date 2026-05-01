-- System Health watchdog tables
CREATE TABLE IF NOT EXISTS public.integration_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration TEXT NOT NULL,            -- 'whatsapp' | 'homely' | 'transcription' | 'ai_gateway' | 'email_queue'
  function_name TEXT,
  error_code TEXT,
  error_message TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iel_integration_created ON public.integration_error_logs (integration, created_at DESC);

CREATE TABLE IF NOT EXISTS public.integration_alert_state (
  integration TEXT PRIMARY KEY,
  last_alerted_at TIMESTAMPTZ,
  last_recovered_at TIMESTAMPTZ,
  is_alerting BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_health_settings (
  id INT PRIMARY KEY DEFAULT 1,
  alert_email TEXT,
  alert_whatsapp_phone TEXT,         -- E.164 normalized (9725...)
  alert_cooldown_minutes INT NOT NULL DEFAULT 30,
  monitored_integrations TEXT[] NOT NULL DEFAULT ARRAY['whatsapp','homely','transcription','ai_gateway','email_queue'],
  CONSTRAINT one_row CHECK (id = 1)
);
INSERT INTO public.system_health_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.integration_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_alert_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read everything
CREATE POLICY "admins read error logs" ON public.integration_error_logs
  FOR SELECT TO authenticated USING (public.is_admin_or_above(auth.uid()));

CREATE POLICY "admins read alert state" ON public.integration_alert_state
  FOR SELECT TO authenticated USING (public.is_admin_or_above(auth.uid()));

CREATE POLICY "admins manage settings" ON public.system_health_settings
  FOR ALL TO authenticated
  USING (public.is_admin_or_above(auth.uid()))
  WITH CHECK (public.is_admin_or_above(auth.uid()));

-- Public status RPC: returns per-integration health (last 5 min) without exposing PII
CREATE OR REPLACE FUNCTION public.get_system_status()
RETURNS TABLE(integration TEXT, status TEXT, recent_failures INT, last_failure_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cfg AS (SELECT monitored_integrations FROM public.system_health_settings WHERE id = 1),
  monitored AS (SELECT unnest(monitored_integrations) AS integration FROM cfg),
  recent AS (
    SELECT integration, COUNT(*)::int AS cnt, MAX(created_at) AS last_at
    FROM public.integration_error_logs
    WHERE created_at > now() - interval '5 minutes'
    GROUP BY integration
  )
  SELECT
    m.integration,
    CASE
      WHEN COALESCE(r.cnt,0) >= 3 THEN 'degraded'
      WHEN COALESCE(r.cnt,0) >= 1 THEN 'warning'
      ELSE 'operational'
    END AS status,
    COALESCE(r.cnt,0),
    r.last_at
  FROM monitored m
  LEFT JOIN recent r USING (integration);
$$;

GRANT EXECUTE ON FUNCTION public.get_system_status() TO anon, authenticated;