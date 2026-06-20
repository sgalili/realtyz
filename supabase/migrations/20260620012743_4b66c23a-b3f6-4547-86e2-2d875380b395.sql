
-- Allow leads to be removed cleanly: cascade chat_history rows and add a hardened RPC

ALTER TABLE public.chat_history
  DROP CONSTRAINT IF EXISTS chat_history_lead_id_fkey,
  ADD CONSTRAINT chat_history_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.delete_leads_cascade(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.can_delete_leads(auth.uid()) THEN
    RAISE EXCEPTION 'insufficient permissions to delete leads';
  END IF;

  -- Clean dependents that don't auto-handle deletion
  DELETE FROM public.approval_queue WHERE lead_id = ANY(_ids);
  DELETE FROM public.campaign_logs WHERE lead_id = ANY(_ids);
  DELETE FROM public.trial_autopilot_messages WHERE lead_id = ANY(_ids);
  DELETE FROM public.trial_inbound_replies WHERE lead_id = ANY(_ids);
  DELETE FROM public.interaction_activity_log WHERE lead_id = ANY(_ids);
  DELETE FROM public.scheduled_items WHERE lead_id = ANY(_ids);
  DELETE FROM public.outreach_suggestions WHERE lead_id = ANY(_ids);
  DELETE FROM public.deal_room_comments WHERE lead_id = ANY(_ids);
  DELETE FROM public.escalation_alerts WHERE lead_id = ANY(_ids);
  DELETE FROM public.client_portal_links WHERE lead_id = ANY(_ids);
  DELETE FROM public.broker_referrals WHERE lead_id = ANY(_ids);
  DELETE FROM public.meetings WHERE lead_id = ANY(_ids);
  DELETE FROM public.booking_tokens WHERE lead_id = ANY(_ids);

  -- Main delete (messages, chat_history, autopilot_queue, homely_push_log cascade)
  WITH d AS (DELETE FROM public.leads WHERE id = ANY(_ids) RETURNING 1)
  SELECT count(*) INTO deleted_count FROM d;

  RETURN deleted_count;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  -- Some optional tables may not exist; retry main delete only
  WITH d AS (DELETE FROM public.leads WHERE id = ANY(_ids) RETURNING 1)
  SELECT count(*) INTO deleted_count FROM d;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_leads_cascade(uuid[]) TO authenticated;
