ALTER TABLE public.property_tours
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_event_link text;

ALTER TABLE public.scheduled_items
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_event_link text;

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.enqueue_calendar_autosync(_table text, _record_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/calendar-autosync';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eWx5Z2h3ZnlzdnlkeWdxZHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjMxMDEsImV4cCI6MjA5NTk5OTEwMX0.3_sZy9BP9GIXO1yA1PoFYVdO0tDYzx7oFbfflsdk3aE';
BEGIN
  IF _record_id IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', anon_key,
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object('table', _table, 'record_id', _record_id)
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_meeting_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.starts_at IS NOT NULL AND NEW.google_calendar_event_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.starts_at IS DISTINCT FROM NEW.starts_at) THEN
    PERFORM public.enqueue_calendar_autosync('meetings', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meetings_calendar_sync ON public.meetings;
CREATE TRIGGER trg_meetings_calendar_sync
AFTER INSERT OR UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.on_meeting_calendar_sync();

CREATE OR REPLACE FUNCTION public.on_property_tour_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.scheduled_at IS NOT NULL AND NEW.google_event_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at) THEN
    PERFORM public.enqueue_calendar_autosync('property_tours', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_property_tours_calendar_sync ON public.property_tours;
CREATE TRIGGER trg_property_tours_calendar_sync
AFTER INSERT OR UPDATE ON public.property_tours
FOR EACH ROW EXECUTE FUNCTION public.on_property_tour_calendar_sync();

CREATE OR REPLACE FUNCTION public.on_scheduled_item_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.scheduled_for IS NOT NULL AND NEW.google_event_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.scheduled_for IS DISTINCT FROM NEW.scheduled_for) THEN
    PERFORM public.enqueue_calendar_autosync('scheduled_items', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scheduled_items_calendar_sync ON public.scheduled_items;
CREATE TRIGGER trg_scheduled_items_calendar_sync
AFTER INSERT OR UPDATE ON public.scheduled_items
FOR EACH ROW EXECUTE FUNCTION public.on_scheduled_item_calendar_sync();

CREATE OR REPLACE FUNCTION public.on_demo_request_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.preferred_at IS NOT NULL AND NEW.google_event_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.preferred_at IS DISTINCT FROM NEW.preferred_at) THEN
    PERFORM public.enqueue_calendar_autosync('demo_requests', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demo_requests_calendar_sync ON public.demo_requests;
CREATE TRIGGER trg_demo_requests_calendar_sync
AFTER INSERT OR UPDATE ON public.demo_requests
FOR EACH ROW EXECUTE FUNCTION public.on_demo_request_calendar_sync();