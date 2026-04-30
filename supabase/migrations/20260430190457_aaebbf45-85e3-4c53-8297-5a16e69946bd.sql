
-- ============ AUTOPILOT QUEUE ============
CREATE TABLE IF NOT EXISTS public.autopilot_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id uuid,
  message_content text NOT NULL,
  template_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  last_error text,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  locked_at timestamptz,
  locked_by text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_queue_due
  ON public.autopilot_queue (status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_autopilot_queue_user
  ON public.autopilot_queue (user_id, status);
CREATE INDEX IF NOT EXISTS idx_autopilot_queue_campaign
  ON public.autopilot_queue (campaign_id);

ALTER TABLE public.autopilot_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own queue"
  ON public.autopilot_queue FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_above(auth.uid()));

CREATE POLICY "Users insert own queue"
  ON public.autopilot_queue FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own queue"
  ON public.autopilot_queue FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_above(auth.uid()));

CREATE POLICY "Users delete own queue"
  ON public.autopilot_queue FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_above(auth.uid()));

CREATE TRIGGER trg_autopilot_queue_updated_at
  BEFORE UPDATE ON public.autopilot_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ENQUEUE RPC ============
CREATE OR REPLACE FUNCTION public.queue_autopilot_messages(
  p_lead_ids uuid[],
  p_message text,
  p_campaign_id uuid DEFAULT NULL,
  p_template_id text DEFAULT NULL,
  p_min_delay_sec int DEFAULT 30,
  p_max_delay_sec int DEFAULT 60
) RETURNS TABLE(queued_count int, first_scheduled_at timestamptz, last_scheduled_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cursor_ts timestamptz := now();
  lid uuid;
  delay_sec int;
  inserted int := 0;
  first_ts timestamptz;
  last_ts timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_lead_ids IS NULL OR array_length(p_lead_ids,1) IS NULL THEN
    RAISE EXCEPTION 'lead_ids cannot be empty';
  END IF;
  IF array_length(p_lead_ids,1) > 5000 THEN
    RAISE EXCEPTION 'Cannot queue more than 5000 messages at once';
  END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'message cannot be empty';
  END IF;
  IF p_min_delay_sec < 1 OR p_max_delay_sec < p_min_delay_sec THEN
    RAISE EXCEPTION 'invalid delay range';
  END IF;

  FOREACH lid IN ARRAY p_lead_ids LOOP
    delay_sec := p_min_delay_sec + floor(random() * (p_max_delay_sec - p_min_delay_sec + 1))::int;
    cursor_ts := cursor_ts + make_interval(secs => delay_sec);
    IF first_ts IS NULL THEN first_ts := cursor_ts; END IF;
    last_ts := cursor_ts;

    INSERT INTO public.autopilot_queue
      (user_id, lead_id, campaign_id, message_content, template_id, scheduled_at)
    VALUES
      (uid, lid, p_campaign_id, p_message, p_template_id, cursor_ts);
    inserted := inserted + 1;
  END LOOP;

  RETURN QUERY SELECT inserted, first_ts, last_ts;
END;
$$;

-- ============ ATOMIC CLAIM (used by worker) ============
CREATE OR REPLACE FUNCTION public.claim_autopilot_jobs(p_limit int DEFAULT 10, p_worker text DEFAULT 'drain')
RETURNS SETOF public.autopilot_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.autopilot_queue q
  SET status = 'processing', locked_at = now(), locked_by = p_worker, attempts = q.attempts + 1
  WHERE q.id IN (
    SELECT id FROM public.autopilot_queue
    WHERE status = 'pending' AND scheduled_at <= now()
    ORDER BY scheduled_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING *;
$$;

-- ============ STUCK JOB RECOVERY ============
CREATE OR REPLACE FUNCTION public.requeue_stuck_autopilot_jobs()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.autopilot_queue
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
        locked_at = NULL, locked_by = NULL,
        last_error = COALESCE(last_error,'') || ' [recovered from stuck processing]'
    WHERE status = 'processing' AND locked_at < now() - interval '5 minutes'
    RETURNING 1
  )
  SELECT COUNT(*)::int FROM updated;
$$;
