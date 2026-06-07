
CREATE TABLE IF NOT EXISTS public.inbound_emails_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_email text NOT NULL,
  to_email text,
  subject text,
  body_text text,
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  matched_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  matched_broker_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'logged',
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inbound_emails_log TO authenticated;
GRANT ALL ON public.inbound_emails_log TO service_role;

ALTER TABLE public.inbound_emails_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Broker reads own inbound" ON public.inbound_emails_log;
CREATE POLICY "Broker reads own inbound" ON public.inbound_emails_log
  FOR SELECT TO authenticated
  USING (
    matched_broker_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE INDEX IF NOT EXISTS inbound_emails_log_broker_idx
  ON public.inbound_emails_log (matched_broker_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inbound_emails_log_to_idx
  ON public.inbound_emails_log (to_email);
