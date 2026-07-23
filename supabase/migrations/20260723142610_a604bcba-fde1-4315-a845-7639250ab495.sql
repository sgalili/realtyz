
ALTER TABLE public.campaign_logs
  ADD COLUMN IF NOT EXISTS series_id uuid,
  ADD COLUMN IF NOT EXISTS series_index integer,
  ADD COLUMN IF NOT EXISTS series_total integer,
  ADD COLUMN IF NOT EXISTS needs_regeneration boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regen_prompt text,
  ADD COLUMN IF NOT EXISTS listing_id uuid,
  ADD COLUMN IF NOT EXISTS first_comment text,
  ADD COLUMN IF NOT EXISTS media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS group_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_profile_key text,
  ADD COLUMN IF NOT EXISTS target_account_ref text,
  ADD COLUMN IF NOT EXISTS workspace_owner_id uuid,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text;

CREATE INDEX IF NOT EXISTS idx_campaign_logs_dispatcher
  ON public.campaign_logs (status, needs_regeneration, sent_at)
  WHERE status = 'scheduled' AND needs_regeneration = true;

CREATE INDEX IF NOT EXISTS idx_campaign_logs_series
  ON public.campaign_logs (series_id, series_index)
  WHERE series_id IS NOT NULL;
