ALTER TABLE public.campaign_activity_queue
  ADD COLUMN IF NOT EXISTS publication_status text NOT NULL DEFAULT 'pending_time_bank',
  ADD COLUMN IF NOT EXISTS owner_notified_at timestamptz;

ALTER TABLE public.campaign_activity_queue
  DROP CONSTRAINT IF EXISTS campaign_activity_queue_publication_status_check;

ALTER TABLE public.campaign_activity_queue
  ADD CONSTRAINT campaign_activity_queue_publication_status_check
  CHECK (publication_status IN ('pending_time_bank','ready_awaiting_whatsapp_auth','published'));

CREATE INDEX IF NOT EXISTS idx_caq_publication_status
  ON public.campaign_activity_queue (workspace_owner_id, publication_status);