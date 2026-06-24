
-- Dedup trigger: drop INSERTs into interaction_activity_log when an
-- equivalent row was written for the same thread within the last 10s.
CREATE OR REPLACE FUNCTION public.dedupe_interaction_activity_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dup_id uuid;
BEGIN
  IF NEW.thread_key IS NULL OR NEW.action_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _dup_id
  FROM public.interaction_activity_log
  WHERE thread_key = NEW.thread_key
    AND action_type = NEW.action_type
    AND COALESCE(platform, '')      = COALESCE(NEW.platform, '')
    AND COALESCE(actor_type, '')    = COALESCE(NEW.actor_type, '')
    AND COALESCE(content, '')       = COALESCE(NEW.content, '')
    AND created_at > now() - interval '10 seconds'
  LIMIT 1;

  IF _dup_id IS NOT NULL THEN
    RETURN NULL;  -- skip the insert, treat as duplicate within the window
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dedupe_interaction_activity_log ON public.interaction_activity_log;
CREATE TRIGGER trg_dedupe_interaction_activity_log
  BEFORE INSERT ON public.interaction_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.dedupe_interaction_activity_log();
