CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS app_private.internal_secrets (name text PRIMARY KEY, value text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON app_private.internal_secrets FROM PUBLIC, anon, authenticated;
INSERT INTO app_private.internal_secrets(name, value)
VALUES ('CRON_SECRET', encode(extensions.gen_random_bytes(32), 'hex')) ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.internal_call_headers()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eWx5Z2h3ZnlzdnlkeWdxZHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjMxMDEsImV4cCI6MjA5NTk5OTEwMX0.3_sZy9BP9GIXO1yA1PoFYVdO0tDYzx7oFbfflsdk3aE',
    'x-cron-secret', (SELECT value FROM app_private.internal_secrets WHERE name = 'CRON_SECRET')
  )
$$;
REVOKE ALL ON FUNCTION public.internal_call_headers() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_internal_secret(_secret text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(length(_secret), 0) >= 32 AND EXISTS (
    SELECT 1 FROM app_private.internal_secrets WHERE name = 'CRON_SECRET' AND value = _secret
  )
$$;
REVOKE ALL ON FUNCTION public.verify_internal_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_internal_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_calendar_autosync(_table text, _record_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF _record_id IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := 'https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/calendar-autosync',
    headers := public.internal_call_headers(),
    body := jsonb_build_object('table', _table, 'record_id', _record_id));
EXCEPTION WHEN OTHERS THEN NULL;
END; $function$;

CREATE OR REPLACE FUNCTION public.trigger_wa_avatar_fetch_for_lead(p_lead_id uuid, p_owner_id uuid DEFAULT NULL::uuid, p_force boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF p_lead_id IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := 'https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/fetch-wa-avatars',
    headers := public.internal_call_headers(),
    body := jsonb_build_object('lead_ids', jsonb_build_array(p_lead_id), 'owner_id', p_owner_id, 'force', p_force));
EXCEPTION WHEN OTHERS THEN NULL;
END; $function$;

CREATE OR REPLACE FUNCTION public.trigger_match_for_lead(p_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  PERFORM net.http_post(url := 'https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/match-and-alert',
    headers := public.internal_call_headers(),
    body := jsonb_build_object('lead_id', p_lead_id, 'threshold', 60));
EXCEPTION WHEN OTHERS THEN NULL;
END; $function$;

CREATE OR REPLACE FUNCTION public.autopilot_queue_wake()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  PERFORM net.http_post(url := 'https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/autopilot-queue-drain',
    headers := public.internal_call_headers(),
    body := jsonb_build_object('trigger', 'enqueue'));
  RETURN NEW;
END; $function$;

DO $$
DECLARE r record; base text := 'https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('autopilot-queue-drain-retry','autopilot-queue-drain','jsonb_build_object(''trigger'',''retry'')'),
    ('cloud-group-poster-tick','cloud-group-poster','jsonb_build_object(''time'', now())'),
    ('engagement-greetings-daily','engagement-greetings','jsonb_build_object(''time'', now())'),
    ('homely-daily-sync','homely-daily-sync','jsonb_build_object(''source'',''pg_cron'',''invoked_at'', now())'),
    ('lead-followup-drip','lead-followup-drip','jsonb_build_object(''trigger'',''cron'')'),
    ('lease-expiry-reminders-daily','lease-expiry-reminders','jsonb_build_object(''time'', now())'),
    ('listings-metadata-backfill-nightly','listings-metadata-backfill','''{"limit": 900, "deep": true, "deep_limit": 10}''::jsonb'),
    ('owner-crm-sync-hourly','owner-crm-sync','''{"limit": 200}''::jsonb'),
    ('process-activity-queue-5min','process-activity-queue','jsonb_build_object(''tick'', now())'),
    ('scheduled-post-dispatcher','scheduled-post-dispatcher','jsonb_build_object(''trigger'',''cron'')'),
    ('tour-feedback-followup-hourly','tour-feedback-followup','jsonb_build_object(''time'', now())'),
    ('tour-reminders-every-5-min','tour-reminders','jsonb_build_object(''time'', now())'),
    ('webtiv-homely-sync-every-15-min','webtiv-homely-sync','jsonb_build_object(''source'',''cron'',''ts'', now())'),
    ('yad2-market-sync-evening','properties-scheduled-sync','''{"reason":"cron_evening"}''::jsonb'),
    ('yad2-market-sync-morning','properties-scheduled-sync','''{"reason":"cron_morning"}''::jsonb')
  ) AS t(jobname, fn, body)
  LOOP
    PERFORM cron.alter_job(j.jobid, command := format(
      'SELECT net.http_post(url := %L, headers := public.internal_call_headers(), body := %s);', base || r.fn, r.body))
    FROM cron.job j WHERE j.jobname = r.jobname;
  END LOOP;
END $$;