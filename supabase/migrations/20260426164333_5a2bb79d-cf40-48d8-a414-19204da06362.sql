-- Per-recipient campaign send log
CREATE TABLE IF NOT EXISTS public.campaign_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_name TEXT NOT NULL,
  channel TEXT NOT NULL,                          -- 'sms' | 'whatsapp' | 'email' | 'voice'
  voter_id UUID,                                  -- nullable: file imports may not have a voter row
  recipient_phone TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  message_body TEXT,
  status TEXT NOT NULL DEFAULT 'queued',          -- queued | sent | delivered | failed | skipped | pending_provider
  failure_reason TEXT,                            -- e.g. 'missing_phone', 'invalid_phone', 'provider_not_configured', 'insufficient_balance'
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_campaign_logs_user_id ON public.campaign_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign_name ON public.campaign_logs (campaign_name);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_status ON public.campaign_logs (status);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_created_at ON public.campaign_logs (created_at DESC);

ALTER TABLE public.campaign_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own campaign_logs"
ON public.campaign_logs FOR INSERT TO authenticated
WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users view own campaign_logs"
ON public.campaign_logs FOR SELECT TO authenticated
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users update own campaign_logs"
ON public.campaign_logs FOR UPDATE TO authenticated
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users delete own campaign_logs"
ON public.campaign_logs FOR DELETE TO authenticated
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));