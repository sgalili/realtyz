ALTER TABLE public.campaign_logs ADD COLUMN IF NOT EXISTS source_account text;
CREATE INDEX IF NOT EXISTS idx_campaign_logs_user_created ON public.campaign_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_status ON public.campaign_logs(status);