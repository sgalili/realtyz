ALTER TABLE public.call_records
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_event_link text;

CREATE OR REPLACE FUNCTION public.on_meeting_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.starts_at IS NOT NULL THEN
      PERFORM public.enqueue_calendar_autosync('meetings', NEW.id);
    END IF;
  ELSIF OLD.starts_at IS DISTINCT FROM NEW.starts_at
     OR OLD.ends_at IS DISTINCT FROM NEW.ends_at
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.description IS DISTINCT FROM NEW.description
     OR OLD.location IS DISTINCT FROM NEW.location
     OR OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_calendar_autosync('meetings', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_property_tour_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.scheduled_at IS NOT NULL THEN
      PERFORM public.enqueue_calendar_autosync('property_tours', NEW.id);
    END IF;
  ELSIF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
     OR OLD.property_title IS DISTINCT FROM NEW.property_title
     OR OLD.property_address IS DISTINCT FROM NEW.property_address
     OR OLD.client_name IS DISTINCT FROM NEW.client_name
     OR OLD.client_phone IS DISTINCT FROM NEW.client_phone
     OR OLD.notes IS DISTINCT FROM NEW.notes
     OR OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_calendar_autosync('property_tours', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_scheduled_item_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.scheduled_for IS NOT NULL THEN
      PERFORM public.enqueue_calendar_autosync('scheduled_items', NEW.id);
    END IF;
  ELSIF OLD.scheduled_for IS DISTINCT FROM NEW.scheduled_for
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.content IS DISTINCT FROM NEW.content
     OR OLD.item_type IS DISTINCT FROM NEW.item_type
     OR OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_calendar_autosync('scheduled_items', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_demo_request_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.preferred_at IS NOT NULL THEN
      PERFORM public.enqueue_calendar_autosync('demo_requests', NEW.id);
    END IF;
  ELSIF OLD.preferred_at IS DISTINCT FROM NEW.preferred_at
     OR OLD.first_name IS DISTINCT FROM NEW.first_name
     OR OLD.last_name IS DISTINCT FROM NEW.last_name
     OR OLD.phone IS DISTINCT FROM NEW.phone
     OR OLD.notes IS DISTINCT FROM NEW.notes
     OR OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_calendar_autosync('demo_requests', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demo_requests_calendar_sync ON public.demo_requests;
CREATE TRIGGER trg_demo_requests_calendar_sync
AFTER INSERT OR UPDATE ON public.demo_requests
FOR EACH ROW EXECUTE FUNCTION public.on_demo_request_calendar_sync();

CREATE OR REPLACE FUNCTION public.on_call_record_calendar_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.started_at IS NOT NULL THEN
      PERFORM public.enqueue_calendar_autosync('call_records', NEW.id);
    END IF;
  ELSIF OLD.started_at IS DISTINCT FROM NEW.started_at
     OR OLD.ended_at IS DISTINCT FROM NEW.ended_at
     OR OLD.duration_seconds IS DISTINCT FROM NEW.duration_seconds
     OR OLD.summary IS DISTINCT FROM NEW.summary
     OR OLD.direction IS DISTINCT FROM NEW.direction
     OR OLD.needs_callback IS DISTINCT FROM NEW.needs_callback
     OR OLD.callback_reason IS DISTINCT FROM NEW.callback_reason
     OR OLD.recording_url IS DISTINCT FROM NEW.recording_url
     OR OLD.lead_id IS DISTINCT FROM NEW.lead_id
     OR OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_calendar_autosync('call_records', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_records_calendar_sync ON public.call_records;
CREATE TRIGGER trg_call_records_calendar_sync
AFTER INSERT OR UPDATE ON public.call_records
FOR EACH ROW EXECUTE FUNCTION public.on_call_record_calendar_sync();