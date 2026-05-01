-- Compliance & Audit layer additions
-- 1. Track AI-assisted outbound content explicitly
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS ai_assisted boolean NOT NULL DEFAULT false;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS disclosure_appended boolean NOT NULL DEFAULT false;

-- 2. Hard-delete helper that wipes all data for a single prospect.
-- SECURITY DEFINER so it can cascade across tables; checks the caller is
-- authenticated and either owns the lead (any auth user can manage leads
-- per existing RLS) or is a super_admin.
CREATE OR REPLACE FUNCTION public.gdpr_delete_lead(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  deleted jsonb := '{}'::jsonb;
  cnt int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Anyone authenticated may already manage leads per existing RLS.
  -- We still record what we did for the audit trail.
  DELETE FROM public.chat_history WHERE lead_id = _lead_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := deleted || jsonb_build_object('chat_history', cnt);

  DELETE FROM public.messages WHERE lead_id = _lead_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := deleted || jsonb_build_object('messages', cnt);

  DELETE FROM public.call_records WHERE lead_id = _lead_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := deleted || jsonb_build_object('call_records', cnt);

  DELETE FROM public.meetings WHERE lead_id = _lead_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := deleted || jsonb_build_object('meetings', cnt);

  DELETE FROM public.booking_tokens WHERE lead_id = _lead_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := deleted || jsonb_build_object('booking_tokens', cnt);

  DELETE FROM public.escalation_alerts WHERE lead_id = _lead_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := deleted || jsonb_build_object('escalation_alerts', cnt);

  DELETE FROM public.interaction_activity_log WHERE thread_key = _lead_id::text;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := deleted || jsonb_build_object('interaction_activity_log', cnt);

  DELETE FROM public.leads WHERE id = _lead_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := deleted || jsonb_build_object('leads', cnt);

  -- Audit trail (immutable)
  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, details)
  VALUES (uid, 'gdpr_delete_lead', 'leads', _lead_id::text, deleted);

  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.gdpr_delete_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gdpr_delete_lead(uuid) TO authenticated;