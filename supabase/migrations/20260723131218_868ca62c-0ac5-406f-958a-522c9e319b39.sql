
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Trigger helper: fire match-and-alert for a given lead id (fire-and-forget)
CREATE OR REPLACE FUNCTION public.trigger_match_for_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/match-and-alert';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eWx5Z2h3ZnlzdnlkeWdxZHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjMxMDEsImV4cCI6MjA5NTk5OTEwMX0.3_sZy9BP9GIXO1yA1PoFYVdO0tDYzx7oFbfflsdk3aE';
BEGIN
  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', anon_key, 'Authorization', 'Bearer ' || anon_key),
    body := jsonb_build_object('lead_id', p_lead_id, 'threshold', 60)
  );
EXCEPTION WHEN OTHERS THEN
  -- Never break the parent transaction on a failed background call.
  NULL;
END;
$$;

-- After a new lead is inserted, schedule matching in the background.
CREATE OR REPLACE FUNCTION public.on_lead_insert_trigger_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.trigger_match_for_lead(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_ai_match_after_insert ON public.leads;
CREATE TRIGGER trg_leads_ai_match_after_insert
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.on_lead_insert_trigger_match();

-- After a lead's preferences change, re-match.
CREATE OR REPLACE FUNCTION public.on_lead_prefs_update_trigger_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.preferences IS DISTINCT FROM OLD.preferences
     OR NEW.city IS DISTINCT FROM OLD.city
     OR NEW.neighborhood IS DISTINCT FROM OLD.neighborhood
     OR NEW.deal_type IS DISTINCT FROM OLD.deal_type THEN
    PERFORM public.trigger_match_for_lead(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_ai_match_after_update ON public.leads;
CREATE TRIGGER trg_leads_ai_match_after_update
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.on_lead_prefs_update_trigger_match();

-- After a listing is inserted, re-match every lead in the same workspace.
CREATE OR REPLACE FUNCTION public.on_listing_insert_trigger_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_row record;
BEGIN
  FOR lead_row IN
    SELECT id FROM public.leads
    WHERE assigned_to = NEW.user_id
    ORDER BY updated_at DESC
    LIMIT 100
  LOOP
    PERFORM public.trigger_match_for_lead(lead_row.id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listings_ai_match_after_insert ON public.listings;
CREATE TRIGGER trg_listings_ai_match_after_insert
AFTER INSERT ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.on_listing_insert_trigger_match();

-- Periodic sweep: re-score the 200 most-recently-touched leads every 15 minutes.
CREATE OR REPLACE FUNCTION public.matcher_periodic_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_row record;
BEGIN
  FOR lead_row IN
    SELECT id FROM public.leads
    WHERE preferences IS NOT NULL AND preferences <> '{}'::jsonb
    ORDER BY updated_at DESC
    LIMIT 200
  LOOP
    PERFORM public.trigger_match_for_lead(lead_row.id);
  END LOOP;
END;
$$;

-- Dashboard KPI RPC.
CREATE OR REPLACE FUNCTION public.get_match_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'today', (SELECT count(*) FROM public.deal_room_matches WHERE broker_id = p_user_id AND created_at >= date_trunc('day', now())),
    'week', (SELECT count(*) FROM public.deal_room_matches WHERE broker_id = p_user_id AND created_at >= now() - interval '7 days'),
    'hot', COALESCE((SELECT jsonb_agg(t) FROM (
       SELECT id, lead_id, listing_id, match_score, match_reasons, status, created_at
       FROM public.deal_room_matches
       WHERE broker_id = p_user_id AND match_score >= 70
       ORDER BY match_score DESC, created_at DESC
       LIMIT 3
    ) t), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_match_stats(uuid) TO authenticated;
