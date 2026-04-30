-- Add email and provider tracking columns
ALTER TABLE public.voters ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.campaign_logs ADD COLUMN IF NOT EXISTS provider_message_id text;
CREATE INDEX IF NOT EXISTS idx_campaign_logs_user_status ON public.campaign_logs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign_name ON public.campaign_logs(campaign_name);