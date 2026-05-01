
-- Add priority score columns to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS priority_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_score_components jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS priority_score_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_priority_score integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_priority_score ON public.leads (priority_score DESC);

-- Trigger function: when a new message arrives for a lead, queue an async score recompute.
-- Uses pg_net to call the compute-prospect-score edge function with service role auth.
CREATE OR REPLACE FUNCTION public.queue_prospect_score_recompute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  service_key text;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/compute-prospect-score',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('lead_id', NEW.lead_id, 'trigger', 'message')
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the message insert if scoring queueing fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_prospect_score_recompute ON public.messages;
CREATE TRIGGER trg_queue_prospect_score_recompute
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.queue_prospect_score_recompute();
